alter table public.posts
  add column community_body_size text check (community_body_size in ('small','normal','large','extra-large')),
  add column community_body_color text check (community_body_color ~ '^#[0-9a-fA-F]{6}$');

create function ggo_private.default_community_prefixes()
returns table(label text, color text)
language sql immutable set search_path='' as $$
  values ('공지','#c23147'),('정보','#3567c3'),('핫템','#b65b27'),('사진','#161616');
$$;

insert into ggo_private.community_prefixes(board,label,color)
select board.name, prefix.label, prefix.color
from ggo_private.community_boards board cross join ggo_private.default_community_prefixes() prefix
on conflict (board,label) do update set color=excluded.color, active=true;

alter table ggo_private.community_boards alter column notice_color set default '#c23147';
update ggo_private.community_boards set notice_color='#c23147';

create function ggo_private.seed_community_prefixes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into ggo_private.community_prefixes(board,label,color)
  select new.name,label,color from ggo_private.default_community_prefixes();
  return new;
end;
$$;
revoke all on function ggo_private.default_community_prefixes(),ggo_private.seed_community_prefixes() from public,anon,authenticated;
create trigger seed_community_prefixes after insert on ggo_private.community_boards
for each row execute function ggo_private.seed_community_prefixes();

create or replace function public.community_board_catalog(p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_manage and (auth.uid() is null or not public.is_admin()) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'name', b.name, 'position', b.position, 'active', b.active, 'notice_color', b.notice_color, 'prefixes',
    (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'color',p.color,'active',p.active) order by p.label), '[]'::jsonb)
      from ggo_private.community_prefixes p
      where p.board=b.name and (p.active or p_manage)
        and (p.label <> '공지' or public.is_admin())))
    order by b.position,b.name),'[]'::jsonb)
    from ggo_private.community_boards b where b.active or p_manage);
end $$;

create or replace function ggo_private.check_community_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.topic=old.topic and new.community_prefix_id is not distinct from old.community_prefix_id then
      return new;
    end if;
  end if;
  perform 1 from ggo_private.community_boards where name=new.topic and active for share;
  if not found then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
  if new.community_prefix_id is not null then
    perform 1 from ggo_private.community_prefixes
      where id=new.community_prefix_id and board=new.topic and active for share;
    if not found then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
    if exists (select 1 from ggo_private.community_prefixes where id=new.community_prefix_id and label='공지')
       and not exists (select 1 from public.profiles where id=new.user_id and role='admin'
         and (status='active' or (status='suspended' and suspended_until<=now()))) then
      raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end $$;

create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'body_size',p.community_body_size,'body_color',p.community_body_color,'image_path',p.image_path,'topic',p.topic,'notice',p.community_notice,'pin_rank',p.community_pin_rank,
 'prefix',(select jsonb_build_object('id',x.id,'label',x.label,'color',case when x.label='공지' then (select notice_color from ggo_private.community_boards where name=p.topic) else x.color end) from ggo_private.community_prefixes x where x.id=p.community_prefix_id),
 'notice_color',case when p.community_notice then (select notice_color from ggo_private.community_boards where name=p.topic) end,
 'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
$$;

create or replace function public.anonymous_trusted_write(p_actor uuid,p_ip inet,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; thread uuid; poll text; parent uuid; owner uuid; affected integer; begin
 if (family(p_ip)=4 and masklen(p_ip)<>32) or (family(p_ip)=6 and masklen(p_ip)<>128) then raise exception 'GGO_IP_REQUIRED' using errcode='22023'; end if;
 -- Serialize writes against sanctions: no stale status-check race.
 perform 1 from public.profiles where id=p_actor for update;
 if not ggo_private.can_write(p_actor) then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if (select count(*) from ggo_private.audit_log where actor_id=p_actor and action in ('post.create','comment.create','poll_comment.create') and created_at>now()-interval '1 minute')>=5 then raise exception 'GGO_RATE_LIMIT'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 if p_data ?| array['user_id','ip_address','role','status','author_label','is_mine'] then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 if p_action='post.create' then
   if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
   insert into public.posts(user_id,ip_address,title,caption,image_path,topic,community_prefix_id,community_body_size,community_body_color) values(p_actor,p_ip,btrim(p_data->>'title'),btrim(p_data->>'body'),'',coalesce(p_data->>'topic','자유'),nullif(p_data->>'prefix_id','')::uuid,p_data->>'body_size',p_data->>'body_color') returning id into target;
 elsif p_action in ('post.update','post.delete') then
   target=(p_data->>'id')::uuid;
   perform 1 from public.posts where id=target and user_id=p_actor and status='published' and deleted_at is null and not community_notice and ggo_private.community_board_visible(topic) for update;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='post.update' then
    if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
    update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),
      community_body_size=case when p_data ? 'body_size' then p_data->>'body_size' else community_body_size end,
      community_body_color=case when p_data ? 'body_color' then p_data->>'body_color' else community_body_color end,
      community_prefix_id=case when p_data ? 'prefix_id' then nullif(p_data->>'prefix_id','')::uuid
                               when coalesce(p_data->>'topic',topic)=topic then community_prefix_id end,
      community_pin_rank=case when coalesce(p_data->>'topic',topic)=topic then community_pin_rank end,
      topic=coalesce(p_data->>'topic',topic),updated_at=now() where id=target;
   else update public.posts set status='hidden',deleted_at=now(),updated_at=now() where id=target; end if;
 elsif p_action='comment.create' then
   thread=(p_data->>'post_id')::uuid; parent=nullif(p_data->>'parent_id','')::uuid;
   perform 1 from public.posts where id=thread and status='published' and deleted_at is null and ggo_private.community_board_visible(topic) for share;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if parent is not null and not exists(select 1 from public.comments where id=parent and post_id=thread and not hidden and deleted_at is null) then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
   insert into public.comments(post_id,user_id,ip_address,body,parent_id) values(thread,p_actor,p_ip,btrim(p_data->>'body'),parent) returning id into target;
 elsif p_action in ('comment.update','comment.delete') then
   target=(p_data->>'id')::uuid;
   select post_id into thread from public.comments where id=target;
   perform 1 from public.posts where id=thread and status='published' and deleted_at is null and ggo_private.community_board_visible(topic) for share;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='comment.update' then update public.comments set body=btrim(p_data->>'body'),updated_at=now() where id=target and user_id=p_actor and not hidden and deleted_at is null;
   else update public.comments set deleted_at=now(),updated_at=now() where id=target and user_id=p_actor and not hidden and deleted_at is null; end if;
   get diagnostics affected=row_count; if affected<>1 then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 elsif p_action='poll_comment.create' then
   poll=p_data->>'poll_id'; parent=nullif(p_data->>'parent_id','')::uuid;
   perform 1 from public.polls where id=poll and active for share;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if not exists(select 1 from public.poll_ballots where poll_id=poll and user_id=p_actor) then raise exception 'GGO_VOTE_REQUIRED' using errcode='42501'; end if;
   if parent is not null and not exists(select 1 from public.poll_comments where id=parent and poll_id=poll and not hidden and deleted_at is null) then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
   insert into public.poll_comments(poll_id,user_id,ip_address,body,parent_id) values(poll,p_actor,p_ip,btrim(p_data->>'body'),parent) returning id into target;
 elsif p_action in ('poll_comment.update','poll_comment.delete') then
   target=(p_data->>'id')::uuid;
   select poll_id into poll from public.poll_comments where id=target;
   perform 1 from public.polls where id=poll and active for share;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='poll_comment.update' then update public.poll_comments set body=btrim(p_data->>'body'),updated_at=now() where id=target and user_id=p_actor and not hidden and deleted_at is null;
   else update public.poll_comments set deleted_at=now(),updated_at=now() where id=target and user_id=p_actor and not hidden and deleted_at is null; end if;
   get diagnostics affected=row_count; if affected<>1 then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 -- Creation IP stays immutable; later mutation IPs are recorded privately.
 insert into ggo_private.audit_log(actor_id,action,target_id,details) values(p_actor,p_action,target::text,jsonb_build_object('ip_address',host(p_ip)));
 return jsonb_build_object('id',target);
end $$;
