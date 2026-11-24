create function public.site_admin_search_members(p_query text default '',p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; needle text := lower(btrim(coalesce(p_query,''))); begin
 if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if char_length(needle)>200 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'email',u.email,'role',p.role,'status',case when p.status='suspended' and p.suspended_until<=now() then 'active' else p.status end,'suspended_until',p.suspended_until,'created_at',p.created_at,
'post_count',(select count(*) from public.posts x where x.user_id=p.id),
'comment_count',((select count(*) from public.comments x where x.user_id=p.id)+(select count(*) from public.poll_comments x where x.user_id=p.id)),
'poll_count',(select count(*) from public.poll_ballots x where x.user_id=p.id),
'received_report_count',(select count(*) from ggo_private.reports r where
 (r.target_kind='post' and exists(select 1 from public.posts x where x.id=r.target_id and x.user_id=p.id)) or
 (r.target_kind='comment' and exists(select 1 from public.comments x where x.id=r.target_id and x.user_id=p.id)) or
 (r.target_kind='poll_comment' and exists(select 1 from public.poll_comments x where x.id=r.target_id and x.user_id=p.id)))) order by p.created_at desc,p.id),'[]'::jsonb) into result from
 (select profile.* from public.profiles profile join auth.users account on account.id=profile.id
  where needle='' or position(needle in lower(profile.handle))>0
    or position(needle in lower(coalesce(account.email,'')))>0
    or profile.id::text=needle
  order by profile.created_at desc,profile.id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) p join auth.users u on u.id=p.id;
 insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.read_members');return result;
end $$;

create or replace function public.site_admin_members(p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql security invoker set search_path='' as $$
  select public.site_admin_search_members('',p_limit,p_offset);
$$;

create function public.site_admin_change_member_role(p_id uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare
  member public.profiles;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(30741, 1);
  if not coalesce(public.is_admin(),false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_id=auth.uid() then
    raise exception 'GGO_SELF_ROLE_CHANGE' using errcode='42501';
  end if;
  if p_role is null or p_role not in ('user','admin') then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  select * into member from public.profiles where id=p_id for update;
  if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
  if member.role=p_role then return; end if;
  if p_role='admin' and not coalesce(member.status='active'
     or (member.status='suspended' and member.suspended_until<=now()), false) then
    raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501';
  end if;
  update public.profiles set role=p_role where id=p_id;
  insert into ggo_private.audit_log(actor_id,action,target_id,details)
  values(auth.uid(),'admin.member.role.change',p_id::text,jsonb_build_object('from',member.role,'to',p_role));
end;
$$;

revoke all on function public.site_admin_search_members(text,integer,integer),public.site_admin_change_member_role(uuid,text) from public,anon,authenticated;
grant execute on function public.site_admin_search_members(text,integer,integer),public.site_admin_change_member_role(uuid,text) to authenticated;

create function ggo_private.community_admin_author(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles
    where id=p_user and role='admin' and (status='active' or (status='suspended' and suspended_until<=now())));
$$;
revoke all on function ggo_private.community_admin_author(uuid) from public,anon,authenticated;

create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'body_size',p.community_body_size,'body_color',p.community_body_color,'images',p.community_images,'image_path',p.image_path,'topic',p.topic,'notice',p.community_notice,'notice_translations',p.community_notice_translations,'pin_rank',p.community_pin_rank,
 'prefix',(select jsonb_build_object('id',x.id,'label',x.label,'color',case when x.label='공지' then (select notice_color from ggo_private.community_boards where name=p.topic) else x.color end) from ggo_private.community_prefixes x where x.id=p.community_prefix_id),
 'notice_color',case when p.community_notice then (select notice_color from ggo_private.community_boards where name=p.topic) end,
 'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)','is_admin_author',ggo_private.community_admin_author(p.user_id));
$$;

create or replace function public.anonymous_comments(p_kind text,p_thread text,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_kind='post' then
   if not exists(select 1 from public.posts where id::text=p_thread and status='published' and deleted_at is null and ggo_private.community_board_visible(topic)) then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'parent_id',parent_id,'created_at',created_at,'updated_at',updated_at,'is_mine',coalesce(user_id=auth.uid(),false),'author_label',ggo_private.label('post',p_thread,user_id),'is_admin_author',ggo_private.community_admin_author(user_id)) order by created_at,id),'[]'::jsonb) into result from (select * from public.comments where post_id::text=p_thread and not hidden and deleted_at is null order by created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) c;
 elsif p_kind='poll' then
   if not exists(select 1 from public.polls where id=p_thread and active) then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'parent_id',parent_id,'created_at',created_at,'updated_at',updated_at,'is_mine',coalesce(user_id=auth.uid(),false),'author_label',ggo_private.label('poll',p_thread,user_id)) order by created_at,id),'[]'::jsonb) into result from (select * from public.poll_comments where poll_id=p_thread and not hidden and deleted_at is null order by created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) c;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 return result;
end $$;
