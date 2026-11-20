-- Prepared only. No live Supabase connection exists in this checkout.
-- Actual intake stays OFF until the owner enables it and configures retention.
begin;

create table public.emergency_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
create table public.emergency_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  name text not null check(char_length(trim(name)) between 1 and 80),
  phone text not null check(char_length(phone) between 6 and 40),
  email text not null check(char_length(email) between 3 and 254),
  location text not null check(char_length(trim(location)) between 2 and 500),
  body text not null check(char_length(trim(body)) between 10 and 5000),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  status text not null default 'new' check(status in ('new','viewed','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now()+interval '90 days'),
  unique(user_id,client_request_id)
);
create table public.emergency_access_log (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.emergency_requests(id) on delete cascade,
  operator_id uuid not null references auth.users(id),
  action text not null check(action in ('opened','resolved')),
  created_at timestamptz not null default now()
);
alter table public.emergency_settings enable row level security;
alter table public.emergency_requests enable row level security;
alter table public.emergency_access_log enable row level security;
-- No table grants for any visitor, including the sender or browser admin.
revoke all on public.emergency_settings,public.emergency_requests,public.emergency_access_log from public,anon,authenticated;
revoke all on sequence public.emergency_access_log_id_seq from public,anon,authenticated;

create function public.emergency_service_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare configured boolean; retention_active boolean:=false;
begin
  if (select auth.uid()) is null then raise exception '실제 회원 계정으로 로그인이 필요합니다.' using errcode='42501'; end if;
  select coalesce((select enabled from public.emergency_settings where singleton),false) into configured;
  if to_regclass('cron.job') is not null then
    execute 'select exists(select 1 from cron.job where jobname=$1 and active)' into retention_active using 'ggo-emergency-retention';
  end if;
  return jsonb_build_object('enabled',configured and retention_active,'isAdmin',public.is_admin(),'consentVersion','2026-11-14-emergency-v1');
end;
$$;

create function public.submit_emergency_request(
  p_request_id uuid,p_name text,p_phone text,p_email text,p_location text,
  p_body text,p_consent boolean,p_consent_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
  if (select auth.uid()) is null then raise exception '실제 회원 계정으로 로그인이 필요합니다.' using errcode='42501'; end if;
  if p_consent is distinct from true or p_consent_version is distinct from '2026-11-14-emergency-v1' then raise exception '개인정보 수집·이용 동의가 필요합니다.'; end if;
  if not (public.emergency_service_status()->>'enabled')::boolean then raise exception '현재 긴급 요청 접수가 준비 중입니다. 메시지는 전송되지 않았습니다.'; end if;
  if p_request_id is null then raise exception '요청 번호를 확인해 주세요.'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then raise exception '이름을 80자 이내로 입력해 주세요.'; end if;
  if p_phone is null or char_length(p_phone)>40 or p_phone !~ '^[+0-9[:space:]().-]+$' or char_length(regexp_replace(p_phone,'[^0-9]','','g')) not between 6 and 20 then raise exception '연락 가능한 전화번호를 입력해 주세요.'; end if;
  if p_email is null or char_length(p_email)>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception '이메일 주소를 확인해 주세요.'; end if;
  if p_location is null or char_length(trim(p_location)) not between 2 and 500 then raise exception '현위치를 2~500자로 입력해 주세요.'; end if;
  if p_body is null or char_length(trim(p_body)) not between 10 and 5000 then raise exception '요청 내용을 10~5,000자로 입력해 주세요.'; end if;
  perform 1 from public.profiles where id=(select auth.uid()) for update;
  if not found then raise exception '회원 정보를 찾을 수 없습니다.'; end if;
  select id into request_id from public.emergency_requests where user_id=(select auth.uid()) and client_request_id=p_request_id;
  if found then return jsonb_build_object('id',request_id); end if;
  if (select count(*) from public.emergency_requests where user_id=(select auth.uid()) and created_at>now()-interval '1 hour')>=10 then raise exception '요청이 너무 많습니다. 긴급한 위험은 112·119로 연락해 주세요.'; end if;
  insert into public.emergency_requests(user_id,client_request_id,name,phone,email,location,body,consent_version)
    values((select auth.uid()),p_request_id,trim(p_name),trim(p_phone),trim(p_email),trim(p_location),trim(p_body),p_consent_version)
    returning id into request_id;
  -- Return an acknowledgement only. Senders receive no read/list permission.
  return jsonb_build_object('id',request_id);
end;
$$;

create function public.list_emergency_requests(p_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not public.is_admin() then raise exception '운영자만 확인할 수 있는 게시판입니다.' using errcode='42501'; end if;
  if p_status is null or p_status not in ('all','new','viewed','resolved') then raise exception '처리 상태를 확인해 주세요.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'createdAt',r.created_at,'status',r.status) order by r.created_at desc),'[]'::jsonb) into result
    from (select id,name,created_at,status from public.emergency_requests where expires_at>now() and (p_status='all' or status=p_status) order by created_at desc limit 50) r;
  return result;
end;
$$;

create function public.open_emergency_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.emergency_requests;
begin
  if (select auth.uid()) is null or not public.is_admin() then raise exception '운영자만 확인할 수 있는 게시판입니다.' using errcode='42501'; end if;
  update public.emergency_requests set status=case when status='new' then 'viewed' else status end
    where id=p_id and expires_at>now() returning * into r;
  if not found then raise exception '요청을 찾을 수 없거나 보관 기한이 지났습니다.'; end if;
  insert into public.emergency_access_log(request_id,operator_id,action) values(r.id,(select auth.uid()),'opened');
  return jsonb_build_object('id',r.id,'name',r.name,'phone',r.phone,'email',r.email,'location',r.location,
    'body',r.body,'status',r.status,'createdAt',r.created_at,'consentVersion',r.consent_version,
    'consentedAt',r.consented_at,'expiresAt',r.expires_at);
end;
$$;

create function public.resolve_emergency_request(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then raise exception '운영자만 처리할 수 있습니다.' using errcode='42501'; end if;
  update public.emergency_requests set status='resolved',resolved_at=now(),expires_at=least(expires_at,now()+interval '30 days')
    where id=p_id and expires_at>now() and status<>'resolved';
  if found then insert into public.emergency_access_log(request_id,operator_id,action) values(p_id,(select auth.uid()),'resolved'); end if;
end;
$$;

create function public.purge_expired_emergency_requests()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
  delete from public.emergency_requests where expires_at<=now();
  get diagnostics removed=row_count;
  return removed;
end;
$$;
revoke all on function public.emergency_service_status(),public.submit_emergency_request(uuid,text,text,text,text,text,boolean,text),public.list_emergency_requests(text),public.open_emergency_request(uuid),public.resolve_emergency_request(uuid),public.purge_expired_emergency_requests() from public,anon,authenticated;
grant execute on function public.emergency_service_status(),public.submit_emergency_request(uuid,text,text,text,text,text,boolean,text),public.list_emergency_requests(text),public.open_emergency_request(uuid),public.resolve_emergency_request(uuid) to authenticated;
grant execute on function public.purge_expired_emergency_requests() to service_role;
create index emergency_queue_idx on public.emergency_requests(status,created_at desc);
create index emergency_retention_idx on public.emergency_requests(expires_at);
create index emergency_sender_idx on public.emergency_requests(user_id,created_at desc);
commit;
