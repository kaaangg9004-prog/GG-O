create function public.site_admin_post_author(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  author jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', profile.id, 'handle', profile.handle, 'email', account.email,
    'role', profile.role, 'created_at', profile.created_at,
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

revoke all on function public.site_admin_post_author(uuid) from public, anon, authenticated;
grant execute on function public.site_admin_post_author(uuid) to authenticated;
