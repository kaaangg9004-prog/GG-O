-- Apply after 008. Category migration, trusted HOT counters and admin console.
begin;
alter table public.posts drop constraint if exists posts_topic_check;
update public.posts set topic=case topic when '뷰티' then '패션' when 'Beauty' then '패션' when 'Style' then '패션' when '케이팝' then '음악' when '정보' then '자유' when 'Life' then '자유' else topic end;
alter table public.posts add constraint posts_topic_check check(topic in ('자유','밈','연예인','취미','패션','음악'));
alter table public.posts add column if not exists view_count bigint not null default 0 check(view_count>=0);

create or replace function ggo_private.site_settings_valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$ begin
 if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'topMinScore') is distinct from 'number' or jsonb_typeof(v->'commentWeight') is distinct from 'number' or jsonb_typeof(v->'halfLifeHours') is distinct from 'number' or jsonb_typeof(v->'topDays') is distinct from 'number' or jsonb_typeof(v->'communityWritingEnabled') is distinct from 'boolean' or jsonb_typeof(v->'notice') is distinct from 'object' then return false; end if;
 if (v->>'topMinScore')::numeric not between 0.1 and 1000000 or (v->>'commentWeight')::numeric<>trunc((v->>'commentWeight')::numeric) or (v->>'commentWeight')::numeric not between 1 and 100 or (v->>'halfLifeHours')::numeric<>trunc((v->>'halfLifeHours')::numeric) or (v->>'halfLifeHours')::numeric not between 1 and 168 or (v->>'topDays')::numeric<>trunc((v->>'topDays')::numeric) or (v->>'topDays')::numeric not between 1 and 30 then return false; end if;
 return coalesce(jsonb_typeof(v->'notice'->'ko')='string' and jsonb_typeof(v->'notice'->'vi')='string' and jsonb_typeof(v->'notice'->'en')='string' and char_length(v->'notice'->>'ko')<=180 and char_length(v->'notice'->>'vi')<=180 and char_length(v->'notice'->>'en')<=180,false);
exception when others then return false;
end $$;
create table if not exists ggo_private.site_settings (
 singleton boolean primary key default true check(singleton),document jsonb not null check(ggo_private.site_settings_valid(document)),updated_at timestamptz not null default now()
);
insert into ggo_private.site_settings(document) values('{"topMinScore":50,"commentWeight":15,"halfLifeHours":24,"topDays":7,"communityWritingEnabled":true,"notice":{"ko":"","vi":"","en":""}}') on conflict do nothing;
alter table ggo_private.site_settings enable row level security;
revoke all on ggo_private.site_settings from public,anon,authenticated;
create or replace function public.community_settings() returns jsonb language sql stable security definer set search_path='' as $$ select document from ggo_private.site_settings where singleton; $$;
create or replace function public.site_admin_settings(p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if not ggo_private.site_settings_valid(p_settings) then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 -- Keep only documented fields; configuration can never become a secret store.
 update ggo_private.site_settings set document=jsonb_build_object('topMinScore',(p_settings->>'topMinScore')::numeric,'commentWeight',(p_settings->>'commentWeight')::int,'halfLifeHours',(p_settings->>'halfLifeHours')::int,'topDays',(p_settings->>'topDays')::int,'communityWritingEnabled',(p_settings->>'communityWritingEnabled')::boolean,'notice',jsonb_build_object('ko',p_settings->'notice'->>'ko','vi',p_settings->'notice'->>'vi','en',p_settings->'notice'->>'en')),updated_at=now() where singleton;
 insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.settings');
end $$;
create or replace function ggo_private.can_write(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user
 and (p.status='active' or (p.status='suspended' and p.suspended_until<=now()))
 and (p.role='admin' or (select (document->>'communityWritingEnabled')::boolean from ggo_private.site_settings where singleton))
 and u.raw_app_meta_data->>'provider'='google' and exists(select 1 from auth.identities i where i.user_id=p.id and i.provider='google'));
$$;
create or replace function public.anonymous_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('signed_in',auth.uid() is not null,'can_write',public.anonymous_can_write(),'is_admin',public.is_admin(),'writing_enabled',(select (document->>'communityWritingEnabled')::boolean from ggo_private.site_settings where singleton),
 'status',coalesce((select case when status='suspended' and suspended_until<=now() then 'active' else status end from public.profiles where id=auth.uid()),'guest'),'suspended_until',(select suspended_until from public.profiles where id=auth.uid()));
$$;
-- Continuous decay: no midnight reset, no recommendation/like signal.
create or replace function ggo_private.top_score(p public.posts) returns double precision language sql stable security definer set search_path='' as $$
 select case when p.created_at>now() then 0 else (p.view_count+(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null)*(document->>'commentWeight')::int)::double precision
 *power(0.5::double precision,extract(epoch from(now()-p.created_at))::double precision/3600/(document->>'halfLifeHours')::int) end from ggo_private.site_settings where singleton;
$$;
create or replace function ggo_private.is_hot(p public.posts) returns boolean language sql stable security definer set search_path='' as $$
 select p.status='published' and p.deleted_at is null and p.created_at<=now() and p.created_at>=now()-make_interval(days=>(document->>'topDays')::int) and ggo_private.top_score(p)>=(document->>'topMinScore')::numeric from ggo_private.site_settings where singleton;
$$;
create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'image_path',p.image_path,'topic',p.topic,'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
$$;
create or replace function public.anonymous_feed(p_filter text default '전체',p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_filter is null or p_filter not in ('전체','hot','자유','밈','연예인','취미','패션','음악') or char_length(coalesce(p_query,''))>100 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by case when p_filter='hot' then ggo_private.top_score(p) end desc nulls last,p.created_at desc,p.id desc),'[]'::jsonb) into result from
 (select * from public.posts t where t.status='published' and t.deleted_at is null and (p_filter='전체' or p_filter='hot' and ggo_private.is_hot(t) or t.topic=p_filter)
 and (coalesce(p_query,'')='' or position(lower(p_query) in lower(t.title||' '||t.caption))>0)
 and (p_filter='hot' or p_before is null or (t.created_at,t.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by case when p_filter='hot' then ggo_private.top_score(t) end desc nulls last,t.created_at desc,t.id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
 return result;
end $$;

-- Only the trusted API can count views. Browsers cannot supply numeric counts,
-- raw IPs, viewer hashes or member IDs to a publicly executable write function.
create table if not exists ggo_private.post_view_days (
 post_id uuid not null references public.posts(id) on delete cascade,viewer_hash text not null check(viewer_hash ~ '^[0-9a-f]{64}$'),viewed_on date not null,
 primary key(post_id,viewer_hash,viewed_on)
);
create index if not exists post_view_days_expiry on ggo_private.post_view_days(viewed_on);
alter table ggo_private.post_view_days enable row level security;
revoke all on ggo_private.post_view_days from public,anon,authenticated;
create or replace function public.anonymous_trusted_view(p_id uuid,p_viewer_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare inserted integer; n bigint; day_utc date=(now() at time zone 'UTC')::date; begin
 if p_viewer_hash is null or p_viewer_hash !~ '^[0-9a-f]{64}$' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select view_count into n from public.posts where id=p_id and status='published' and deleted_at is null for update;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 insert into ggo_private.post_view_days(post_id,viewer_hash,viewed_on) values(p_id,p_viewer_hash,day_utc) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=1 then update public.posts set view_count=view_count+1 where id=p_id returning view_count into n; end if;
 delete from ggo_private.post_view_days where viewed_on<day_utc-7;
 return jsonb_build_object('views',n);
end $$;

create or replace function public.site_admin_overview() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 return jsonb_build_object('posts',(select count(*) from public.posts where deleted_at is null),'hot',(select count(*) from public.posts p where ggo_private.is_hot(p)),
 'reports',(select count(*) from ggo_private.reports where resolved_at is null),'members',(select count(*) from public.profiles),'polls',(select count(*) from public.polls where active));
end $$;
create or replace function public.site_admin_content(p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(ggo_private.post_json(p)||jsonb_build_object('status',p.status,'deleted',p.deleted_at is not null,'comments',
 (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,'hidden',c.hidden or c.deleted_at is not null,'author_label',ggo_private.label('post',p.id::text,c.user_id)) order by c.created_at),'[]'::jsonb) from public.comments c where c.post_id=p.id)) order by p.created_at desc,p.id desc),'[]'::jsonb) into result from
 (select * from public.posts order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) p;
 insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.read_content');return result;
end $$;
create or replace function public.site_admin_post_action(p_id uuid,p_action text,p_topic text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.posts where id=p_id for update;if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 if p_action='hide' then update public.posts set status='hidden',auto_hidden=false where id=p_id;
 elsif p_action='restore' then update public.posts set status='published',auto_hidden=false,deleted_at=null where id=p_id;
 elsif p_action='delete' then update public.posts set status='hidden',auto_hidden=false,deleted_at=now() where id=p_id;
 elsif p_action='category' and p_topic in ('자유','밈','연예인','취미','패션','음악') then update public.posts set topic=p_topic,updated_at=now() where id=p_id;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.post.'||p_action,p_id::text);
end $$;
create or replace function public.site_admin_comment_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action not in ('hide','restore') or p_action is null then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 update public.comments set hidden=p_action='hide',deleted_at=case when p_action='restore' then null else deleted_at end where id=p_id;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.comment.'||p_action,p_id::text);
end $$;
create or replace function public.site_admin_members(p_limit integer default 50,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'email',u.email,'role',p.role,'status',case when p.status='suspended' and p.suspended_until<=now() then 'active' else p.status end,'suspended_until',p.suspended_until,'created_at',p.created_at) order by p.created_at desc,p.id),'[]'::jsonb) into result from
 (select * from public.profiles order by created_at desc,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) p join auth.users u on u.id=p.id;
 insert into ggo_private.audit_log(actor_id,action) values(auth.uid(),'admin.read_members');return result;
end $$;
create or replace function public.site_admin_member_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$ declare p public.profiles; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into p from public.profiles where id=p_id for update;if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 if p.role='admin' or p.id=auth.uid() then raise exception 'GGO_PROTECTED_ADMIN' using errcode='42501'; end if;
 if p_action not in ('suspend_7d','ban','restore') or p_action is null then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 if p.status='banned' and p_action='suspend_7d' then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 update public.profiles set status=case p_action when 'ban' then 'banned' when 'suspend_7d' then 'suspended' else 'active' end,suspended_until=case when p_action='suspend_7d' then now()+interval '7 days' else null end where id=p_id;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.member.'||p_action,p_id::text);
end $$;
-- Magazine content is managed here as well; only summaries are public.
create or replace function ggo_private.magazine_valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$ begin
 if jsonb_typeof(v) is distinct from 'object' or (v->>'id') is null or (v->>'id') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' or jsonb_typeof(v->'title') is distinct from 'string' or char_length(btrim(v->>'title')) not between 2 and 120 or jsonb_typeof(v->'tag') is distinct from 'string' or char_length(btrim(v->>'tag')) not between 1 and 60 or jsonb_typeof(v->'excerpt') is distinct from 'string' or char_length(v->>'excerpt')>500 or jsonb_typeof(v->'read') is distinct from 'string' or char_length(v->>'read')>60 or jsonb_typeof(v->'image') is distinct from 'string' or jsonb_typeof(v->'paragraphs') is distinct from 'array' then return false; end if;
 if not ((v->>'image') ~ '^/images/[a-zA-Z0-9_./-]+$' or (v->>'image') ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/poll-media/[a-zA-Z0-9_.-]+$') or position('..' in v->>'image')>0 or jsonb_array_length(v->'paragraphs') not between 1 and 20 or exists(select 1 from jsonb_array_elements(v->'paragraphs') x where jsonb_typeof(x)<>'string' or char_length(x#>>'{}') not between 1 and 5000) then return false; end if;
 return true;
exception when others then return false;
end $$;
create table if not exists ggo_private.magazine_articles(id text primary key,document jsonb not null check(ggo_private.magazine_valid(document)),active boolean not null default true,updated_at timestamptz not null default now());
alter table ggo_private.magazine_articles enable row level security;
revoke all on ggo_private.magazine_articles from public,anon,authenticated;
create or replace function public.magazine_summaries() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',document->>'title','tag',document->>'tag','excerpt',document->>'excerpt','image',document->>'image','read',document->>'read') order by updated_at desc,id),'[]'::jsonb) from ggo_private.magazine_articles where active;
$$;
create or replace function public.magazine_open(p_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare doc jsonb; begin
 if auth.uid() is null then raise exception 'GGO_AUTH_REQUIRED' using errcode='42501'; end if;
 select document into doc from ggo_private.magazine_articles where id=p_id and active;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 return doc;
end $$;
create or replace function public.site_admin_magazine(p_document jsonb) returns void language plpgsql security definer set search_path='' as $$ declare doc jsonb; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if not ggo_private.magazine_valid(p_document) then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 doc=jsonb_build_object('id',p_document->>'id','title',p_document->>'title','tag',p_document->>'tag','excerpt',p_document->>'excerpt','image',p_document->>'image','read',p_document->>'read','paragraphs',p_document->'paragraphs');
 insert into ggo_private.magazine_articles(id,document) values(doc->>'id',doc) on conflict(id) do update set document=excluded.document,active=true,updated_at=now();
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.magazine.save',doc->>'id');
end $$;
create or replace function public.site_admin_magazine_remove(p_id text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 update ggo_private.magazine_articles set active=false,updated_at=now() where id=p_id;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.magazine.delete',p_id);
end $$;
revoke all on function public.magazine_summaries(),public.magazine_open(text),public.site_admin_magazine(jsonb),public.site_admin_magazine_remove(text) from public,anon,authenticated;
grant execute on function public.magazine_summaries() to anon,authenticated;
grant execute on function public.magazine_open(text),public.site_admin_magazine(jsonb),public.site_admin_magazine_remove(text) to authenticated;

revoke all on all functions in schema ggo_private from public,anon,authenticated;
revoke all on function public.community_settings(),public.anonymous_feed(text,integer,timestamptz,uuid,text),public.site_admin_settings(jsonb),public.anonymous_trusted_view(uuid,text),public.site_admin_overview(),public.site_admin_content(integer,integer),public.site_admin_post_action(uuid,text,text),public.site_admin_comment_action(uuid,text),public.site_admin_members(integer,integer),public.site_admin_member_action(uuid,text) from public,anon,authenticated;
grant execute on function public.community_settings(),public.anonymous_feed(text,integer,timestamptz,uuid,text) to anon,authenticated;
grant execute on function public.site_admin_settings(jsonb),public.site_admin_overview(),public.site_admin_content(integer,integer),public.site_admin_post_action(uuid,text,text),public.site_admin_comment_action(uuid,text),public.site_admin_members(integer,integer),public.site_admin_member_action(uuid,text) to authenticated;
grant execute on function public.anonymous_trusted_view(uuid,text) to service_role;
commit;
