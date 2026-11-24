create function ggo_private.member_account_name(p_metadata jsonb,p_display_name text) returns text
language sql immutable set search_path='' as $$
  select left(coalesce(
    nullif(btrim(p_metadata->>'full_name'),''),
    nullif(btrim(p_metadata->>'name'),''),
    nullif(btrim(p_display_name),'')
  ),200);
$$;

create function ggo_private.member_account_gender(p_metadata jsonb) returns text
language sql immutable set search_path='' as $$
  select case lower(btrim(p_metadata->>'gender'))
    when 'male' then 'male'
    when 'female' then 'female'
    when 'nonbinary' then 'nonbinary'
    when 'non_binary' then 'nonbinary'
    when 'non-binary' then 'nonbinary'
    when 'other' then 'other'
  end;
$$;

revoke all on function ggo_private.member_account_name(jsonb,text),ggo_private.member_account_gender(jsonb) from public,anon,authenticated;

create or replace function public.site_admin_search_members(p_query text default '',p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; needle text := lower(btrim(coalesce(p_query,''))); begin
 if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if char_length(needle)>200 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'email',u.email,'role',p.role,'status',case when p.status='suspended' and p.suspended_until<=now() then 'active' else p.status end,'suspended_until',p.suspended_until,'created_at',u.created_at,
'name',ggo_private.member_account_name(u.raw_user_meta_data,p.display_name),
'gender',ggo_private.member_account_gender(u.raw_user_meta_data),
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
    or position(needle in lower(coalesce(ggo_private.member_account_name(account.raw_user_meta_data,profile.display_name),'')))>0
    or profile.id::text=needle
  order by profile.created_at desc,profile.id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) p join auth.users u on u.id=p.id;
 insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.read_members');return result;
end $$;

create or replace function public.site_admin_post_author(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  author jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', profile.id, 'handle', profile.handle, 'email', account.email,
    'role', profile.role, 'created_at', account.created_at,
    'name', ggo_private.member_account_name(account.raw_user_meta_data,profile.display_name),
    'gender', ggo_private.member_account_gender(account.raw_user_meta_data),
    'status', case when profile.status = 'suspended' and profile.suspended_until <= now() then 'active' else profile.status end,
    'suspended_until', profile.suspended_until
  ) into author
  from public.posts post
  join public.profiles profile on profile.id = post.user_id
  join auth.users account on account.id = profile.id
  where post.id = p_post_id;

  if author is not null then
    insert into ggo_private.audit_log(actor_id, action, target_id)
    values (auth.uid(), 'admin.read_post_author', p_post_id::text);
  end if;
  return author;
end;
$$;
