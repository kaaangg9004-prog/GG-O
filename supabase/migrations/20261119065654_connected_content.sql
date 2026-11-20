-- Real shared news/events. Identity stays private; only sanitized RPCs are exposed.
alter view public.public_post_stats set (security_invoker=true);
revoke all on public.public_post_stats from anon,authenticated;
revoke all on public.likes,public.saved_posts,public.follows,public.blocks from anon,authenticated;
revoke all on function public.moderate_report(uuid,text) from anon,authenticated;

create table ggo_private.editorial (
 kind text not null check(kind in ('news','event')), id text not null check(id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 document jsonb not null, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(kind,id)
);
create table ggo_private.news_authors (
 news_id text not null, user_id uuid not null references auth.users(id) on delete cascade, number integer not null check(number>0), primary key(news_id,user_id), unique(news_id,number)
);
create table ggo_private.news_comments (
 id uuid primary key default gen_random_uuid(),news_id text not null,user_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 500),created_at timestamptz not null default now(),deleted boolean not null default false
);
create table ggo_private.event_reactions (
 event_id text not null,user_id uuid not null references auth.users(id) on delete cascade,reaction text not null check(reaction in ('like','dislike')),primary key(event_id,user_id)
);
alter table ggo_private.editorial enable row level security;
alter table ggo_private.news_authors enable row level security;
alter table ggo_private.news_comments enable row level security;
alter table ggo_private.event_reactions enable row level security;
revoke all on ggo_private.editorial,ggo_private.news_authors,ggo_private.news_comments,ggo_private.event_reactions from public,anon,authenticated;
create index news_comments_thread on ggo_private.news_comments(news_id,created_at,id);
create index news_comments_member on ggo_private.news_comments(user_id);
create index news_authors_member on ggo_private.news_authors(user_id);
create index event_reactions_member on ggo_private.event_reactions(user_id);

create function public.editorial_list(p_kind text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if p_kind is null or p_kind not in ('news','event') then raise exception 'GGO_INVALID_INPUT'; end if;
 select coalesce(jsonb_agg(e.document||case when p_kind='news' then jsonb_build_object('createdAt',e.created_at,'comments',
 (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'text',c.body,'createdAt',c.created_at,'number',a.number) order by c.created_at,c.id),'[]'::jsonb)
 from (select * from ggo_private.news_comments where news_id=e.id and not deleted order by created_at,id limit 100) c join ggo_private.news_authors a on a.news_id=c.news_id and a.user_id=c.user_id)) else '{}'::jsonb end order by e.created_at desc,e.id),'[]'::jsonb) into result
 from (select * from ggo_private.editorial where kind=p_kind and active order by created_at desc,id limit 100) e;
 return result;
end $$;
create function public.editorial_save(p_kind text,p_document jsonb) returns void language plpgsql security definer set search_path='' as $$
declare doc jsonb; img text; begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('news','event') or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'GGO_INVALID_INPUT'; end if;
 if coalesce(p_document->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or char_length(btrim(coalesce(p_document->>'title',''))) not between 2 and 100 then raise exception 'GGO_INVALID_INPUT'; end if;
 img=p_document->>'image';
 if img is null or char_length(img)>1200000 or position('..' in img)>0 or not (img ~ '^/images/[a-zA-Z0-9_./-]+$' or img ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'GGO_INVALID_INPUT'; end if;
 doc=jsonb_build_object('id',p_document->>'id','title',btrim(p_document->>'title'),'image',img);
 if p_kind='news' then
  if char_length(btrim(coalesce(p_document->>'body',''))) not between 3 and 10000 or char_length(btrim(coalesce(p_document->>'category',''))) not between 1 and 40 then raise exception 'GGO_INVALID_INPUT'; end if;
  doc=doc||jsonb_build_object('body',btrim(p_document->>'body'),'category',btrim(p_document->>'category'));
 else
  if char_length(btrim(coalesce(p_document->>'description',''))) not between 3 and 3000 or char_length(btrim(coalesce(p_document->>'label',''))) not between 2 and 60 or char_length(btrim(coalesce(p_document->>'location',''))) not between 2 and 200 or char_length(coalesce(p_document->>'schedule',''))>200 or coalesce(p_document->>'status','') not in ('기획 중','모집 중','마감','종료') then raise exception 'GGO_INVALID_INPUT'; end if;
  doc=doc||jsonb_build_object('description',btrim(p_document->>'description'),'label',btrim(p_document->>'label'),'location',btrim(p_document->>'location'),'schedule',coalesce(p_document->>'schedule',''),'status',p_document->>'status');
 end if;
 insert into ggo_private.editorial(kind,id,document) values(p_kind,doc->>'id',doc) on conflict(kind,id) do update set document=excluded.document,active=true,updated_at=now();
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'editorial.save.'||p_kind,doc->>'id');
end $$;
create function public.editorial_delete(p_kind text,p_id text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 update ggo_private.editorial set active=false,updated_at=now() where kind=p_kind and id=p_id;
 if not found then raise exception 'GGO_NOT_FOUND'; end if;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'editorial.delete.'||p_kind,p_id);
end $$;
create function public.news_comment(p_id text,p_body text) returns uuid language plpgsql security definer set search_path='' as $$ declare n integer; cid uuid; begin
 perform 1 from public.profiles where id=auth.uid() for update;
 if not public.anonymous_can_write() then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 perform 1 from ggo_private.editorial where kind='news' and id=p_id and active for update;
 if not found then raise exception 'GGO_NOT_FOUND'; end if;
 if (select count(*) from ggo_private.news_comments where user_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception 'GGO_RATE_LIMIT'; end if;
 select number into n from ggo_private.news_authors where news_id=p_id and user_id=auth.uid();
 if n is null then
  select coalesce(max(number),0)+1 into n from ggo_private.news_authors where news_id=p_id;
  insert into ggo_private.news_authors values(p_id,auth.uid(),n);
 end if;
 insert into ggo_private.news_comments(news_id,user_id,body) values(p_id,auth.uid(),btrim(p_body)) returning id into cid;
 return cid;
end $$;
create function public.news_comment_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 update ggo_private.news_comments set deleted=true where id=p_id;
end $$;
create function public.event_my_reactions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(r.event_id,r.reaction),'{}'::jsonb) from ggo_private.event_reactions r join ggo_private.editorial e on e.kind='event' and e.id=r.event_id and e.active where r.user_id=auth.uid();
$$;
create function public.event_react(p_id text,p_reaction text) returns void language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.profiles where id=auth.uid() for update;
 if not public.anonymous_can_write() then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if p_reaction is not null and p_reaction not in ('like','dislike') then raise exception 'GGO_INVALID_INPUT'; end if;
 perform 1 from ggo_private.editorial where kind='event' and id=p_id and active for share;
 if not found then raise exception 'GGO_NOT_FOUND'; end if;
 if p_reaction is null then delete from ggo_private.event_reactions where event_id=p_id and user_id=auth.uid();
 else insert into ggo_private.event_reactions values(p_id,auth.uid(),p_reaction) on conflict(event_id,user_id) do update set reaction=excluded.reaction; end if;
end $$;
revoke all on function public.editorial_list(text),public.editorial_save(text,jsonb),public.editorial_delete(text,text),public.news_comment(text,text),public.news_comment_delete(uuid),public.event_my_reactions(),public.event_react(text,text) from public,anon,authenticated;
grant execute on function public.editorial_list(text) to anon,authenticated;
grant execute on function public.editorial_save(text,jsonb),public.editorial_delete(text,text),public.news_comment(text,text),public.news_comment_delete(uuid),public.event_my_reactions(),public.event_react(text,text) to authenticated;

-- The Supabase gateway deliberately leaves IP null rather than trusting forwarded headers.
create or replace function public.anonymous_trusted_write(p_actor uuid,p_ip inet,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; thread uuid; poll text; parent uuid; owner uuid; affected integer; begin
 if (family(p_ip)=4 and masklen(p_ip)<>32) or (family(p_ip)=6 and masklen(p_ip)<>128) then raise exception 'GGO_IP_REQUIRED' using errcode='22023'; end if;
 -- Serialize writes against sanctions: no stale status-check race.
 perform 1 from public.profiles where id=p_actor for update;
 if not ggo_private.can_write(p_actor) then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
 if (select count(*) from ggo_private.audit_log where actor_id=p_actor and action in ('post.create','comment.create','poll_comment.create') and created_at>now()-interval '1 minute')>=5 then raise exception 'GGO_RATE_LIMIT'; end if;
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
create index audit_actor_time on ggo_private.audit_log(actor_id,created_at);
