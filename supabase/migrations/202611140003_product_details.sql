-- Prepared only; not applied to a live Supabase project.
begin;
alter table public.products add column origin text not null default '';
alter table public.products add column materials text not null default '';
alter table public.products add column size text not null default '';
alter table public.products add column care text not null default '';
alter table public.products add column detail_content text not null default '';
alter table public.products add column detail_images text[] not null default '{}';
commit;
