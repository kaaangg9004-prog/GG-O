create table ggo_private.visual_site (
  id boolean primary key default true check (id),
  document jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  approval_hash text
);
create table ggo_private.visual_site_attempts (
  actor uuid primary key,
  window_start timestamptz not null,
  attempts integer not null
);
insert into ggo_private.visual_site default values;
revoke all on ggo_private.visual_site, ggo_private.visual_site_attempts from public, anon, authenticated;

create function public.visual_site_published() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('document', document, 'revision', revision)
  from ggo_private.visual_site where id;
$$;

create function public.visual_site_publish(p_revision integer, p_document jsonb, p_password text) returns text
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  current_hash text;
  current_revision integer;
  attempt_count integer;
begin
  if actor_id is null or not public.is_admin() then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_document is null or jsonb_typeof(p_document) <> 'object'
    or octet_length(p_document::text) > 2500000 then
    return 'invalid';
  end if;
  select revision, approval_hash into current_revision, current_hash
    from ggo_private.visual_site where id for update;
  if current_revision is distinct from p_revision then return 'conflict'; end if;
  if current_hash is null then return 'unconfigured'; end if;
  insert into ggo_private.visual_site_attempts as attempts(actor, window_start, attempts)
    values (actor_id, now(), 1)
    on conflict (actor) do update set
      window_start = case when attempts.window_start <= now() - interval '15 minutes' then now() else attempts.window_start end,
      attempts = case when attempts.window_start <= now() - interval '15 minutes' then 1 else least(attempts.attempts + 1, 6) end
    returning attempts.attempts into attempt_count;
  if attempt_count > 5 then return 'limited'; end if;
  if p_password is null or octet_length(p_password) > 72
    or extensions.crypt(p_password, current_hash) is distinct from current_hash then
    return 'password';
  end if;
  update ggo_private.visual_site set document=p_document, revision=revision+1 where id;
  delete from ggo_private.visual_site_attempts where actor=actor_id;
  return 'ok';
end;
$$;
revoke all on function public.visual_site_published(), public.visual_site_publish(integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.visual_site_published() to anon, authenticated;
grant execute on function public.visual_site_publish(integer,jsonb,text) to authenticated;
