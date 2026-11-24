alter table public.posts
  alter column topic drop not null,
  add column archived_topic text;

create function ggo_private.detach_archived_community_post()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.deleted_at is not null then
    new.archived_topic := coalesce(old.archived_topic,new.topic);
    new.topic := null;
    new.community_prefix_id := null;
    new.community_pin_rank := null;
  elsif old.deleted_at is not null then
    new.topic := coalesce(new.topic,old.archived_topic);
    perform 1 from ggo_private.community_boards where name=new.topic and active for share;
    if not found then
      raise exception 'GGO_RESTORE_BOARD_REQUIRED' using errcode='22023';
    end if;
    new.archived_topic := null;
  end if;
  return new;
end;
$$;
revoke all on function ggo_private.detach_archived_community_post() from public,anon,authenticated;
create trigger archive_community_post_board before update of deleted_at on public.posts
  for each row execute function ggo_private.detach_archived_community_post();

update public.posts set deleted_at=deleted_at where deleted_at is not null;
alter table public.posts add constraint posts_community_archive_board
  check ((deleted_at is null and topic is not null) or (deleted_at is not null and topic is null));

create or replace function public.site_admin_post_action(p_id uuid,p_action text,p_topic text default null)
returns void language plpgsql security definer set search_path='' as $$
declare post_row public.posts;
begin
  if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into post_row from public.posts where id=p_id for update;
  if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
  if p_action='hide' and post_row.deleted_at is null then
    update public.posts set status='hidden',auto_hidden=false where id=p_id;
  elsif p_action='restore' then
    if post_row.deleted_at is not null then
      update public.posts set status='published',auto_hidden=false,deleted_at=null,topic=coalesce(p_topic,archived_topic) where id=p_id;
    else
      update public.posts set status='published',auto_hidden=false,deleted_at=null where id=p_id;
    end if;
  elsif p_action='delete' and post_row.deleted_at is null then
    update public.posts set status='hidden',auto_hidden=false,deleted_at=now() where id=p_id;
  elsif p_action='category' and post_row.deleted_at is null and ggo_private.community_board_visible(p_topic) then
    update public.posts set community_prefix_id=case when topic=p_topic then community_prefix_id end,
      community_pin_rank=case when topic=p_topic then community_pin_rank end,
      topic=p_topic,updated_at=now() where id=p_id;
  else
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.post.'||p_action,p_id::text);
end;
$$;

create function public.site_admin_community_content(p_section text,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result jsonb;
  page_size integer := greatest(1,least(coalesce(p_limit,50),100));
  page_offset integer := greatest(0,least(coalesce(p_offset,0),100000));
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_section in ('posts','deleted_posts') then
    select coalesce(jsonb_agg(ggo_private.post_json(p)||jsonb_build_object(
      'topic',coalesce(p.topic,p.archived_topic,''),'status',p.status,
      'deleted',p.deleted_at is not null,'comments','[]'::jsonb
    ) order by p.created_at desc,p.id desc),'[]'::jsonb) into result
    from (select * from public.posts where (deleted_at is not null)=(p_section='deleted_posts')
      order by created_at desc,id desc limit page_size offset page_offset) p;
  elsif p_section in ('comments','deleted_comments') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'post_title',p.title,'body',c.body,'hidden',c.hidden,
      'deleted',c.deleted_at is not null,'post_deleted',p.deleted_at is not null,
      'author_label',ggo_private.label('post',c.post_id::text,c.user_id)
    ) order by c.created_at desc,c.id desc),'[]'::jsonb) into result
    from (select * from public.comments where (deleted_at is not null)=(p_section='deleted_comments')
      order by created_at desc,id desc limit page_size offset page_offset) c
    join public.posts p on p.id=c.post_id;
  else
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.read_content');
  return result;
end;
$$;
revoke all on function public.site_admin_community_content(text,integer,integer) from public,anon,authenticated;
grant execute on function public.site_admin_community_content(text,integer,integer) to authenticated;
