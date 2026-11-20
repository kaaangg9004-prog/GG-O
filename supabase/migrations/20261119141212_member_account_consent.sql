-- Per-account consent: no legacy browser records are attributed to an account automatically.
create table public.member_consents (
 user_id uuid not null references auth.users(id) on delete cascade,
 version text not null check (version = '2026-11-16'),
 accepted_at timestamptz not null default now(),
 primary key(user_id,version)
);
alter table public.member_consents enable row level security;
revoke all on public.member_consents from public,anon,authenticated;
grant select on public.member_consents to authenticated;
grant insert(user_id,version) on public.member_consents to authenticated;
create policy member_consent_read on public.member_consents for select to authenticated
 using ((select auth.uid())=user_id);
create policy member_consent_accept on public.member_consents for insert to authenticated
 with check ((select auth.uid())=user_id);
