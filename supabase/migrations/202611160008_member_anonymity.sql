-- GG-O member-based anonymity. Standalone on a NEW Supabase project, or run
-- after GG-O migrations 001–007. Review/backup an existing production database.
-- This file never grants an administrator to a browser-provided account.
begin;
create schema if not exists ggo_private;
revoke all on schema ggo_private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique, display_name text not null default 'GG-O Friend',
  bio text not null default '', avatar_path text, created_at timestamptz not null default now()
);
-- Copy legacy roles only during the first schema upgrade, so rerunning this
-- script never resurrects an administrator who was subsequently demoted.
do $$ begin
 if not exists(select 1 from pg_attribute where attrelid='public.profiles'::regclass and attname='role' and not attisdropped) then
  alter table public.profiles add column role text not null default 'user' check(role in ('user','admin'));
  if to_regclass('public.user_roles') is not null then
   update public.profiles p set role='admin' from public.user_roles r where r.user_id=p.id and r.role='admin';
  end if;
 end if;
end $$;
alter table public.profiles add column if not exists status text not null default 'active' check(status in ('active','suspended','banned'));
alter table public.profiles add column if not exists suspended_until timestamptz;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id,handle,display_name) values(new.id,'ggo_'||substr(md5(new.id::text),1,20),'GG-O Friend') on conflict(id) do nothing;
 return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,handle,display_name) select id,'ggo_'||substr(md5(id::text),1,20),'GG-O Friend' from auth.users on conflict(id) do nothing;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and (status='active' or (status='suspended' and suspended_until<=now())));
$$;
create or replace function ggo_private.can_write(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user
   and (p.status='active' or (p.status='suspended' and p.suspended_until<=now()))
   and u.raw_app_meta_data->>'provider'='google'
   and exists(select 1 from auth.identities i where i.user_id=p.id and i.provider='google'));
$$;
create or replace function public.anonymous_can_write() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(ggo_private.can_write(auth.uid()),false); $$;
create or replace function public.anonymous_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('signed_in',auth.uid() is not null,'can_write',public.anonymous_can_write(),'is_admin',public.is_admin(),
   'status',coalesce((select case when status='suspended' and suspended_until<=now() then 'active' else status end from public.profiles where id=auth.uid()),'guest'),
   'suspended_until',(select suspended_until from public.profiles where id=auth.uid()));
$$;

create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 2 and 100),caption text not null check(char_length(btrim(caption)) between 3 and 3000),
 image_path text not null default '',topic text not null default '자유' check(topic in ('자유','뷰티','패션','케이팝','정보')),
 tags text[] not null default '{}',status text not null default 'published' check(status in ('published','hidden')),
 created_at timestamptz not null default now()
);
alter table public.posts add column if not exists ip_address inet;
alter table public.posts add column if not exists updated_at timestamptz not null default now();
alter table public.posts add column if not exists deleted_at timestamptz;
alter table public.posts add column if not exists report_count integer not null default 0;
alter table public.posts add column if not exists auto_hidden boolean not null default false;
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,body text not null check(char_length(btrim(body)) between 1 and 500),
 hidden boolean not null default false,created_at timestamptz not null default now()
);
alter table public.comments add column if not exists ip_address inet;
alter table public.comments add column if not exists parent_id uuid references public.comments(id);
alter table public.comments add column if not exists updated_at timestamptz not null default now();
alter table public.comments add column if not exists deleted_at timestamptz;
-- Optional poll integration; compatible with migration 007 and usable standalone.
create table if not exists public.polls (
 id text primary key,document jsonb not null,revision integer not null default 1,active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.polls add column if not exists created_by uuid references auth.users(id) on delete set null;
create table if not exists public.poll_ballots (
 poll_id text not null references public.polls(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 answers jsonb not null,revision integer not null,created_at timestamptz not null default now(),primary key(poll_id,user_id)
);
create table if not exists public.poll_comments (
 id uuid primary key default gen_random_uuid(),poll_id text not null,user_id uuid not null,
 body text not null check(char_length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now(),
 foreign key(poll_id,user_id) references public.poll_ballots(poll_id,user_id) on delete cascade
);
alter table public.poll_comments add column if not exists ip_address inet;
alter table public.poll_comments add column if not exists parent_id uuid references public.poll_comments(id);
alter table public.poll_comments add column if not exists hidden boolean not null default false;
alter table public.poll_comments add column if not exists updated_at timestamptz not null default now();
alter table public.poll_comments add column if not exists deleted_at timestamptz;
create index if not exists anonymous_posts_page on public.posts(created_at desc,id desc) where status='published' and deleted_at is null;
create index if not exists anonymous_comments_page on public.comments(post_id,created_at,id);
create index if not exists anonymous_poll_comments_page on public.poll_comments(poll_id,created_at,id);

create table if not exists ggo_private.thread_counters (
 kind text not null check(kind in ('post','poll')),thread_id text not null,next_number integer not null default 0,primary key(kind,thread_id)
);
create table if not exists ggo_private.author_numbers (
 kind text not null,thread_id text not null,user_id uuid not null references auth.users(id) on delete cascade,number integer not null check(number>0),
 primary key(kind,thread_id,user_id),unique(kind,thread_id,number)
);
create table if not exists ggo_private.reports (
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users(id) on delete cascade,
 target_kind text not null check(target_kind in ('post','comment','poll_comment')),target_id uuid not null,
 reason text not null check(char_length(btrim(reason)) between 3 and 1000),created_at timestamptz not null default now(),
 resolved_at timestamptz,action text,unique(reporter_id,target_kind,target_id)
);
create table if not exists ggo_private.audit_log (
 id bigint generated always as identity primary key,actor_id uuid,action text not null,target_id text,
 details jsonb not null default '{}',created_at timestamptz not null default now()
);
create index if not exists anonymous_report_queue on ggo_private.reports(created_at desc,id desc);

-- Atomic per-thread allocation: a transaction locks the thread counter before
-- consulting the mapping. Deleted comments never delete/reassign a number.
create or replace function ggo_private.assign_number(p_kind text,p_thread text,p_user uuid) returns integer
language plpgsql security definer set search_path='' as $$ declare n integer; begin
 insert into ggo_private.thread_counters(kind,thread_id) values(p_kind,p_thread) on conflict do nothing;
 perform 1 from ggo_private.thread_counters where kind=p_kind and thread_id=p_thread for update;
 select number into n from ggo_private.author_numbers where kind=p_kind and thread_id=p_thread and user_id=p_user;
 if n is null then
   update ggo_private.thread_counters set next_number=next_number+1 where kind=p_kind and thread_id=p_thread returning next_number into n;
   insert into ggo_private.author_numbers(kind,thread_id,user_id,number) values(p_kind,p_thread,p_user,n);
 end if;
 return n;
end $$;
create or replace function ggo_private.label(p_kind text,p_thread text,p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when (p_kind='post' and exists(select 1 from public.posts where id::text=p_thread and user_id=p_user))
   or (p_kind='poll' and exists(select 1 from public.polls where id=p_thread and created_by=p_user)) then 'Ẩn danh (Tác giả)'
 else 'Ẩn danh '||coalesce((select number from ggo_private.author_numbers where kind=p_kind and thread_id=p_thread and user_id=p_user)::text,'') end;
$$;
create or replace function ggo_private.number_comment() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_table_name='comments' then
  if not exists(select 1 from public.posts where id=new.post_id and user_id=new.user_id) then perform ggo_private.assign_number('post',new.post_id::text,new.user_id); end if;
 else
  if not exists(select 1 from public.polls where id=new.poll_id and created_by=new.user_id) then perform ggo_private.assign_number('poll',new.poll_id,new.user_id); end if;
 end if;
 return new;
end $$;
drop trigger if exists anonymous_comment_number on public.comments;
create trigger anonymous_comment_number before insert on public.comments for each row execute function ggo_private.number_comment();
drop trigger if exists anonymous_poll_comment_number on public.poll_comments;
create trigger anonymous_poll_comment_number before insert on public.poll_comments for each row execute function ggo_private.number_comment();
-- Backfill chronological first appearances before exposing any old comments.
do $$ declare r record; begin
 for r in select c.post_id,c.user_id,min(c.created_at) first_at from public.comments c join public.posts p on p.id=c.post_id where c.user_id<>p.user_id group by c.post_id,c.user_id order by min(c.created_at),c.user_id loop perform ggo_private.assign_number('post',r.post_id::text,r.user_id); end loop;
 for r in select c.poll_id,c.user_id,min(c.created_at) first_at from public.poll_comments c join public.polls p on p.id=c.poll_id where c.user_id is distinct from p.created_by group by c.poll_id,c.user_id order by min(c.created_at),c.user_id loop perform ggo_private.assign_number('poll',r.poll_id,r.user_id); end loop;
 if to_regclass('public.reports') is not null then
   insert into ggo_private.reports(id,reporter_id,target_kind,target_id,reason,created_at,resolved_at,action)
   select id,reporter_id,case when comment_id is null then 'post' else 'comment' end,coalesce(comment_id,post_id),reason,created_at,reviewed_at,action from public.reports on conflict do nothing;
 end if;
end $$;

-- Revoke old table AND column grants. Removing only SELECT on a table would
-- leave migration 002's column grants usable through PostgREST.
do $$ declare t regclass; cols text; pol record; begin
 for t in select unnest(array['public.profiles'::regclass,'public.posts'::regclass,'public.comments'::regclass,'public.polls'::regclass,'public.poll_comments'::regclass,'public.poll_ballots'::regclass]) loop
   execute format('alter table %s enable row level security',t);
   execute format('revoke all on table %s from public, anon, authenticated',t);
   select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=t and attnum>0 and not attisdropped;
   execute format('revoke all (%s) on table %s from public, anon, authenticated',cols,t);
   for pol in select policyname from pg_policies where schemaname='public' and tablename=(select relname from pg_class where oid=t) loop execute format('drop policy %I on %s',pol.policyname,t); end loop;
 end loop;
 if to_regclass('public.reports') is not null then execute 'revoke all on public.reports from anon, authenticated'; end if;
end $$;
alter table ggo_private.author_numbers enable row level security;
alter table ggo_private.thread_counters enable row level security;
alter table ggo_private.reports enable row level security;
alter table ggo_private.audit_log enable row level security;
revoke all on all tables in schema ggo_private from public,anon,authenticated;
revoke all on all sequences in schema ggo_private from public,anon,authenticated;
-- Profiles are only visible to their owner; role/status are never client editable.
grant select(id,handle,display_name,bio,avatar_path,created_at,role,status,suspended_until),update(handle,display_name,bio,avatar_path) on public.profiles to authenticated;
create policy anonymous_profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy anonymous_profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Defense in depth even if a future migration mistakenly grants table writes.
create policy anonymous_post_insert on public.posts for insert to authenticated with check(user_id=auth.uid() and public.anonymous_can_write() and ip_address is not null and status='published' and deleted_at is null);
create policy anonymous_post_update on public.posts for update to authenticated using(user_id=auth.uid() and public.anonymous_can_write()) with check(user_id=auth.uid() and public.anonymous_can_write());
create policy anonymous_post_delete on public.posts for delete to authenticated using(user_id=auth.uid() and public.anonymous_can_write());
create policy anonymous_comment_insert on public.comments for insert to authenticated with check(user_id=auth.uid() and public.anonymous_can_write() and ip_address is not null and not hidden and deleted_at is null and exists(select 1 from public.posts p where p.id=post_id and p.status='published' and p.deleted_at is null));
create policy anonymous_comment_update on public.comments for update to authenticated using(user_id=auth.uid() and public.anonymous_can_write()) with check(user_id=auth.uid() and public.anonymous_can_write());
create policy anonymous_comment_delete on public.comments for delete to authenticated using(user_id=auth.uid() and public.anonymous_can_write());
create policy anonymous_poll_comment_insert on public.poll_comments for insert to authenticated with check(user_id=auth.uid() and public.anonymous_can_write() and ip_address is not null and not hidden and deleted_at is null);
create policy anonymous_poll_comment_update on public.poll_comments for update to authenticated using(user_id=auth.uid() and public.anonymous_can_write()) with check(user_id=auth.uid() and public.anonymous_can_write());
create policy anonymous_poll_comment_delete on public.poll_comments for delete to authenticated using(user_id=auth.uid() and public.anonymous_can_write());

create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'image_path',p.image_path,'topic',p.topic,'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),
 'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
$$;
create or replace function public.anonymous_posts(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by p.created_at desc,p.id desc),'[]'::jsonb) from
 (select * from public.posts where status='published' and deleted_at is null and (p_before is null or (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
$$;
create or replace function public.anonymous_post(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare p public.posts; begin
 select * into p from public.posts where id=p_id and status='published' and deleted_at is null;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 return ggo_private.post_json(p);
end $$;
create or replace function public.anonymous_comments(p_kind text,p_thread text,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_kind='post' then
   if not exists(select 1 from public.posts where id::text=p_thread and status='published' and deleted_at is null) then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'parent_id',parent_id,'created_at',created_at,'updated_at',updated_at,'is_mine',coalesce(user_id=auth.uid(),false),'author_label',ggo_private.label('post',p_thread,user_id)) order by created_at,id),'[]'::jsonb) into result from (select * from public.comments where post_id::text=p_thread and not hidden and deleted_at is null order by created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) c;
 elsif p_kind='poll' then
   if not exists(select 1 from public.polls where id=p_thread and active) then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'parent_id',parent_id,'created_at',created_at,'updated_at',updated_at,'is_mine',coalesce(user_id=auth.uid(),false),'author_label',ggo_private.label('poll',p_thread,user_id)) order by created_at,id),'[]'::jsonb) into result from (select * from public.poll_comments where poll_id=p_thread and not hidden and deleted_at is null order by created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) c;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 return result;
end $$;

-- The ONLY content-write entry point. EXECUTE belongs to service_role, never
-- anon/authenticated. The trusted API verifies the JWT and supplies actor/IP.
create or replace function public.anonymous_trusted_write(p_actor uuid,p_ip inet,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; thread uuid; poll text; parent uuid; owner uuid; affected integer; begin
 if p_ip is null or (family(p_ip)=4 and masklen(p_ip)<>32) or (family(p_ip)=6 and masklen(p_ip)<>128) then raise exception 'GGO_IP_REQUIRED' using errcode='22023'; end if;
 -- Serialize writes against sanctions: no stale status-check race.
 perform 1 from public.profiles where id=p_actor for update;
 if not ggo_private.can_write(p_actor) then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 if p_data ?| array['user_id','ip_address','role','status','author_label','is_mine'] then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 if p_action='post.create' then
   if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
   insert into public.posts(user_id,ip_address,title,caption,image_path,topic) values(p_actor,p_ip,btrim(p_data->>'title'),btrim(p_data->>'body'),'',coalesce(p_data->>'topic','자유')) returning id into target;
 elsif p_action in ('post.update','post.delete') then
   target=(p_data->>'id')::uuid;
   perform 1 from public.posts where id=target and user_id=p_actor and status='published' and deleted_at is null for update;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='post.update' then
    if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
    update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),topic=coalesce(p_data->>'topic',topic),updated_at=now() where id=target;
   else update public.posts set status='hidden',deleted_at=now(),updated_at=now() where id=target; end if;
 elsif p_action='comment.create' then
   thread=(p_data->>'post_id')::uuid; parent=nullif(p_data->>'parent_id','')::uuid;
   perform 1 from public.posts where id=thread and status='published' and deleted_at is null for share;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if parent is not null and not exists(select 1 from public.comments where id=parent and post_id=thread and not hidden and deleted_at is null) then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
   insert into public.comments(post_id,user_id,ip_address,body,parent_id) values(thread,p_actor,p_ip,btrim(p_data->>'body'),parent) returning id into target;
 elsif p_action in ('comment.update','comment.delete') then
   target=(p_data->>'id')::uuid;
   select post_id into thread from public.comments where id=target;
   perform 1 from public.posts where id=thread and status='published' and deleted_at is null for share;
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

create or replace function public.anonymous_report(p_kind text,p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare added integer; begin
 if not public.anonymous_can_write() then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if p_kind='post' then perform 1 from public.posts where id=p_id and status='published' and deleted_at is null;
 elsif p_kind='comment' then perform 1 from public.comments c join public.posts p on p.id=c.post_id where c.id=p_id and not c.hidden and c.deleted_at is null and p.status='published' and p.deleted_at is null;
 elsif p_kind='poll_comment' then perform 1 from public.poll_comments c join public.polls p on p.id=c.poll_id where c.id=p_id and not c.hidden and c.deleted_at is null and p.active;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 insert into ggo_private.reports(reporter_id,target_kind,target_id,reason) values(auth.uid(),p_kind,p_id,btrim(p_reason)) on conflict(reporter_id,target_kind,target_id) do nothing;
 get diagnostics added=row_count;
 if added=0 then raise exception 'GGO_ALREADY_REPORTED' using errcode='23505'; end if;
 if p_kind='post' then update public.posts set report_count=report_count+1,status=case when report_count+1=50 then 'hidden' else status end,auto_hidden=case when report_count+1=50 then true else auto_hidden end where id=p_id; end if;
end $$;

create or replace function public.anonymous_admin_reports(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'target_kind',r.target_kind,'target_id',r.target_id,'reason',r.reason,'created_at',r.created_at,'resolved_at',r.resolved_at,'action',r.action,
 'user_id',x.user_id,'email',u.email,'ip_address',host(x.ip_address),'body',x.body,'member_status',p.status,'suspended_until',p.suspended_until) order by r.created_at desc,r.id desc),'[]'::jsonb) into result
 from (select * from ggo_private.reports order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) r
 left join lateral (select user_id,ip_address,caption body from public.posts where r.target_kind='post' and id=r.target_id
 union all select user_id,ip_address,body from public.comments where r.target_kind='comment' and id=r.target_id
 union all select user_id,ip_address,body from public.poll_comments where r.target_kind='poll_comment' and id=r.target_id) x on true
 left join auth.users u on u.id=x.user_id left join public.profiles p on p.id=x.user_id;
 insert into ggo_private.audit_log(actor_id,action,details) values(auth.uid(),'admin.read_reports',jsonb_build_object('limit',p_limit,'offset',p_offset,'report_ids',(select jsonb_agg(value->>'id') from jsonb_array_elements(result))));
 return result;
end $$;
create or replace function public.anonymous_admin_action(p_report_id uuid,p_action text,p_delete_content boolean default false) returns void
language plpgsql security definer set search_path='' as $$ declare r ggo_private.reports; author uuid; member public.profiles; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('suspend_7d','ban','delete','dismiss') or p_delete_content is null then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select * into r from ggo_private.reports where id=p_report_id for update;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 if r.resolved_at is not null then return; end if; -- retries do not extend a sanction
 if r.target_kind='post' then select user_id into author from public.posts where id=r.target_id;
 elsif r.target_kind='comment' then select user_id into author from public.comments where id=r.target_id;
 else select user_id into author from public.poll_comments where id=r.target_id; end if;
 if author is null then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 select * into member from public.profiles where id=author for update;
 if p_action in ('suspend_7d','ban') then
  if author=auth.uid() or member.role='admin' then raise exception 'GGO_PROTECTED_ADMIN' using errcode='42501'; end if;
  if p_action='suspend_7d' and member.status='banned' then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
  update public.profiles set status=case when p_action='ban' then 'banned' else 'suspended' end,suspended_until=case when p_action='ban' then null else now()+interval '7 days' end where id=author;
 end if;
 if p_action='delete' or (p_delete_content and p_action in ('suspend_7d','ban')) then
  if r.target_kind='post' then update public.posts set status='hidden',deleted_at=now(),updated_at=now() where id=r.target_id;
  elsif r.target_kind='comment' then update public.comments set hidden=true,deleted_at=now(),updated_at=now() where id=r.target_id;
  else update public.poll_comments set hidden=true,deleted_at=now(),updated_at=now() where id=r.target_id; end if;
 end if;
 if p_action='dismiss' and r.target_kind='post' then update public.posts set status='published',auto_hidden=false where id=r.target_id and auto_hidden and deleted_at is null; end if;
 update ggo_private.reports set resolved_at=now(),action=p_action where target_kind=r.target_kind and target_id=r.target_id and resolved_at is null;
 insert into ggo_private.audit_log(actor_id,action,target_id,details) values(auth.uid(),'admin.'||p_action,r.id::text,jsonb_build_object('member_id',author,'delete_content',p_action='delete' or (p_delete_content and p_action in ('suspend_7d','ban')),'previous_status',member.status));
end $$;

-- Poll detail remains public; ballot totals remain participant-only. All
-- comments use the same per-thread numbering and private write gateway.
create or replace function public.poll_open(p_id text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare poll public.polls; mine public.poll_ballots; result jsonb; comments jsonb; participants bigint;
begin
 select * into poll from public.polls where id=p_id and active;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 select * into mine from public.poll_ballots where poll_id=p_id and user_id=auth.uid();
 if found then
  select count(*) into participants from public.poll_ballots where poll_id=p_id;
  select jsonb_agg(jsonb_build_object('questionId',q->>'id','options',(select jsonb_agg(jsonb_build_object('optionId',opt->>'id','count',(select count(*) from public.poll_ballots b where b.poll_id=p_id and b.answers->>(q->>'id')=opt->>'id')) order by oi) from jsonb_array_elements(q->'options') with ordinality as opts(opt,oi))) order by qi) into result from jsonb_array_elements(poll.document->'questions') with ordinality as questions(q,qi);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c->>'id','text',c->>'body','createdAt',c->>'created_at','author_label',c->>'author_label','is_mine',(c->>'is_mine')::boolean)),'[]'::jsonb) into comments from jsonb_array_elements(public.anonymous_comments('poll',p_id,50,0)) c;
 return jsonb_build_object('poll',poll.document||jsonb_build_object('revision',poll.revision,'active',poll.active),'myVote',case when mine.user_id is null then null else jsonb_build_object('answers',mine.answers,'createdAt',mine.created_at) end,'results',result,'participants',participants,'comments',comments,'questionsLocked',public.is_admin() and exists(select 1 from public.poll_ballots where poll_id=p_id));
end $$;
create or replace function ggo_private.poll_author() returns trigger language plpgsql security definer set search_path='' as $$ begin
 new.created_by=auth.uid();return new;
end $$;
drop trigger if exists anonymous_poll_author on public.polls;
create trigger anonymous_poll_author before insert on public.polls for each row execute function ggo_private.poll_author();
revoke all on function public.poll_open(text) from public,anon,authenticated;
grant execute on function public.poll_open(text) to anon,authenticated;

-- No public Realtime stream may expose raw rows/ownership fields.
do $$ declare n text; begin
 foreach n in array array['posts','comments','poll_comments'] loop
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=n) then execute format('alter publication supabase_realtime drop table public.%I',n); end if;
 end loop;
 -- Disable the old browser-write RPC, which has no trusted IP capture.
 if to_regprocedure('public.poll_comment(text,text)') is not null then execute 'revoke all on function public.poll_comment(text,text) from public,anon,authenticated'; end if;
end $$;
revoke all on all functions in schema ggo_private from public,anon,authenticated;
revoke all on function public.is_admin(),public.anonymous_can_write(),public.anonymous_access(),public.anonymous_posts(integer,timestamptz,uuid),public.anonymous_post(uuid),public.anonymous_comments(text,text,integer,integer),public.anonymous_report(text,uuid,text),public.anonymous_admin_reports(integer,integer),public.anonymous_admin_action(uuid,text,boolean),public.anonymous_trusted_write(uuid,inet,text,jsonb) from public,anon,authenticated;
grant execute on function public.is_admin(),public.anonymous_can_write(),public.anonymous_access(),public.anonymous_posts(integer,timestamptz,uuid),public.anonymous_post(uuid),public.anonymous_comments(text,text,integer,integer) to anon,authenticated;
grant execute on function public.anonymous_report(text,uuid,text),public.anonymous_admin_reports(integer,integer),public.anonymous_admin_action(uuid,text,boolean) to authenticated;
grant execute on function public.anonymous_trusted_write(uuid,inet,text,jsonb) to service_role;
commit;
