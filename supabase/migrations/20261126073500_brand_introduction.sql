create table public.brand_introductions (
  locale text primary key check (locale in ('ko','vi','en')),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 30 and octet_length(blocks::text) <= 160000)
);

alter table public.brand_introductions enable row level security;
revoke all on public.brand_introductions from public, anon, authenticated;
grant select on public.brand_introductions to anon, authenticated;
grant insert, update on public.brand_introductions to authenticated;

create policy "Read published brand introduction" on public.brand_introductions
  for select to anon, authenticated using (true);
create policy "Admins create brand introduction" on public.brand_introductions
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins replace brand introduction" on public.brand_introductions
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));
