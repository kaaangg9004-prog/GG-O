create table ggo_private.community_boards (
  name text primary key check (char_length(name) between 1 and 30 and name not in ('전체', 'hot')),
  position integer not null default 100 check (position between 0 and 10000),
  active boolean not null default true,
  notice_color text not null default '#a22f37' check (notice_color ~ '^#[0-9a-fA-F]{6}$')
);
insert into ggo_private.community_boards(name, position) values
  ('자유',10),('밈',20),('연예인',30),('취미',40),('패션',50),('음악',60),('애니메이션',70);
insert into ggo_private.community_boards(name, active)
  select distinct topic, false from public.posts
  where topic not in ('전체','hot') on conflict do nothing;

create table ggo_private.community_prefixes (
  id uuid primary key default gen_random_uuid(),
  board text not null references ggo_private.community_boards(name),
  label text not null check (char_length(label) between 1 and 24 and label !~ '[\[\]]'),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  unique (board, label),
  unique (board, id)
);
alter table ggo_private.community_boards enable row level security;
alter table ggo_private.community_prefixes enable row level security;
revoke all on ggo_private.community_boards, ggo_private.community_prefixes from public, anon, authenticated;

alter table public.posts drop constraint if exists posts_topic_check;
alter table public.posts
  add column community_prefix_id uuid,
  add column community_notice boolean not null default false,
  add column community_pin_rank integer check (community_pin_rank between 1 and 10000),
  add constraint posts_community_board_fk foreign key (topic) references ggo_private.community_boards(name),
  add constraint posts_community_prefix_fk foreign key (topic, community_prefix_id) references ggo_private.community_prefixes(board, id);
create index posts_community_order on public.posts(topic,created_at desc,id desc)
  where status='published' and deleted_at is null;
create index posts_community_highlights on public.posts(topic,community_notice desc,community_pin_rank,created_at desc,id desc)
  where status='published' and deleted_at is null and (community_notice or community_pin_rank is not null);

create function ggo_private.community_board_visible(p_board text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from ggo_private.community_boards where name=p_board and active);
$$;
revoke all on function ggo_private.community_board_visible(text) from public,anon,authenticated;

create function public.community_board_catalog(p_manage boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_manage and (auth.uid() is null or not public.is_admin()) then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'name', b.name, 'position', b.position, 'active', b.active, 'notice_color', b.notice_color, 'prefixes',
    (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'color',p.color,'active',p.active) order by p.label), '[]'::jsonb)
      from ggo_private.community_prefixes p
      where p.board=b.name and (p.active or p_manage)))
    order by b.position,b.name),'[]'::jsonb)
    from ggo_private.community_boards b where b.active or p_manage);
end $$;

create function public.community_board_manage(p_action text, p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
  board_name text := btrim(p_data->>'board');
  prefix_label text := btrim(p_data->>'label');
  prefix_color text := p_data->>'color';
  target uuid;
  post_row public.posts;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_action='board.create' then
    if board_name is null or char_length(board_name) not between 1 and 30 or lower(board_name) in ('all','hot') or board_name='전체' then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    insert into ggo_private.community_boards(name,position)
    values(board_name,coalesce((p_data->>'position')::integer,100));
  elsif p_action='board.update' then
    update ggo_private.community_boards
    set active=coalesce((p_data->>'active')::boolean,active),
        position=coalesce((p_data->>'position')::integer,position),
        notice_color=coalesce(lower(p_data->>'notice_color'),notice_color)
    where name=board_name;
    if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
  elsif p_action='prefix.save' then
    if prefix_label is null or char_length(prefix_label) not between 1 and 24
       or prefix_label='공지' or prefix_label ~ '[\[\]]'
       or prefix_color is null or prefix_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    insert into ggo_private.community_prefixes(board,label,color)
    values(board_name,prefix_label,lower(prefix_color))
    on conflict (board,label) do update set color=excluded.color,active=true;
  elsif p_action='prefix.archive' then
    update ggo_private.community_prefixes set active=false where board=board_name and id=(p_data->>'id')::uuid;
    if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
  elsif p_action='notice.create' then
    if not ggo_private.community_board_visible(board_name) or
       char_length(coalesce(btrim(p_data->>'title'),'')) not between 2 and 100 or
       char_length(coalesce(btrim(p_data->>'body'),'')) not between 3 and 3000 then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    insert into public.posts(user_id,title,caption,image_path,topic,community_notice)
    values(auth.uid(),btrim(p_data->>'title'),btrim(p_data->>'body'),'',board_name,true)
    returning id into target;
  elsif p_action in ('notice.update','notice.archive','post.pin') then
    target := (p_data->>'id')::uuid;
    select * into post_row from public.posts
    where id=target and topic=board_name and status='published' and deleted_at is null for update;
    if not found or (p_action <> 'post.pin' and not post_row.community_notice) then
      raise exception 'GGO_NOT_FOUND' using errcode='P0002';
    end if;
    if p_action='post.pin' then
      update public.posts set community_pin_rank=(p_data->>'rank')::integer where id=target;
    elsif p_action='notice.archive' then
      update public.posts set status='hidden', deleted_at=now(), updated_at=now() where id=target;
    else
      if char_length(coalesce(btrim(p_data->>'title'),'')) not between 2 and 100 or
         char_length(coalesce(btrim(p_data->>'body'),'')) not between 3 and 3000 then
        raise exception 'GGO_INVALID_INPUT' using errcode='22023';
      end if;
      update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),updated_at=now() where id=target;
    end if;
  else
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  insert into ggo_private.audit_log(actor_id,action,target_id)
  values(auth.uid(),'admin.community.'||p_action,coalesce(target::text,board_name));
end $$;

revoke all on function public.community_board_catalog(boolean), public.community_board_manage(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.community_board_catalog(boolean) to anon,authenticated;
grant execute on function public.community_board_manage(text,jsonb) to authenticated;

create function ggo_private.check_community_post() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.topic=old.topic and new.community_prefix_id is not distinct from old.community_prefix_id then
      return new;
    end if;
  end if;
  perform 1 from ggo_private.community_boards where name=new.topic and active for share;
  if not found then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
  if new.community_prefix_id is not null then
    perform 1 from ggo_private.community_prefixes
      where id=new.community_prefix_id and board=new.topic and active for share;
    if not found then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
  end if;
  return new;
end $$;
revoke all on function ggo_private.check_community_post() from public,anon,authenticated;
create trigger check_community_post before insert or update of topic,community_prefix_id on public.posts
  for each row execute function ggo_private.check_community_post();

create function public.community_board_highlights(p_board text) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(ggo_private.post_json(p) order by p.community_notice desc,p.community_pin_rank nulls last,p.created_at desc,p.id desc),'[]'::jsonb)
  from (select * from public.posts
    where topic=p_board and ggo_private.community_board_visible(p_board)
      and status='published' and deleted_at is null and (community_notice or community_pin_rank is not null)
    order by community_notice desc,community_pin_rank nulls last,created_at desc,id desc) p;
$$;
revoke all on function public.community_board_highlights(text) from public,anon,authenticated;
grant execute on function public.community_board_highlights(text) to anon,authenticated;

create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'image_path',p.image_path,'topic',p.topic,'notice',p.community_notice,'pin_rank',p.community_pin_rank,
 'prefix',(select jsonb_build_object('id',x.id,'label',x.label,'color',x.color) from ggo_private.community_prefixes x where x.id=p.community_prefix_id),
 'notice_color',case when p.community_notice then (select notice_color from ggo_private.community_boards where name=p.topic) end,
 'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
$$;

create or replace function public.anonymous_feed(p_filter text default '전체',p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_filter is null or (p_filter not in ('전체','hot') and not ggo_private.community_board_visible(p_filter)) or char_length(coalesce(p_query,''))>100 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by case when p_filter='hot' then ggo_private.top_score(p) end desc nulls last,p.created_at desc,p.id desc),'[]'::jsonb) into result from
 (select * from public.posts t where t.status='published' and t.deleted_at is null and ggo_private.community_board_visible(t.topic) and (p_filter='전체' or p_filter='hot' and ggo_private.is_hot(t) or t.topic=p_filter)
 and (coalesce(p_query,'')='' or position(lower(p_query) in lower(t.title||' '||coalesce((select label from ggo_private.community_prefixes where id=t.community_prefix_id),'')||case when auth.uid() is null then '' else ' '||t.caption end))>0)
 and (p_filter='hot' or p_before is null or (t.created_at,t.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by case when p_filter='hot' then ggo_private.top_score(t) end desc nulls last,t.created_at desc,t.id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
 return result;
end $$;

create or replace function public.anonymous_post(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare p public.posts; begin
 select * into p from public.posts where id=p_id and status='published' and deleted_at is null and ggo_private.community_board_visible(topic);
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 return ggo_private.post_json(p);
end $$;

create or replace function public.anonymous_comments(p_kind text,p_thread text,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_kind='post' then
   if not exists(select 1 from public.posts where id::text=p_thread and status='published' and deleted_at is null and ggo_private.community_board_visible(topic)) then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'parent_id',parent_id,'created_at',created_at,'updated_at',updated_at,'is_mine',coalesce(user_id=auth.uid(),false),'author_label',ggo_private.label('post',p_thread,user_id)) order by created_at,id),'[]'::jsonb) into result from (select * from public.comments where post_id::text=p_thread and not hidden and deleted_at is null order by created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) c;
 elsif p_kind='poll' then
   if not exists(select 1 from public.polls where id=p_thread and active) then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'parent_id',parent_id,'created_at',created_at,'updated_at',updated_at,'is_mine',coalesce(user_id=auth.uid(),false),'author_label',ggo_private.label('poll',p_thread,user_id)) order by created_at,id),'[]'::jsonb) into result from (select * from public.poll_comments where poll_id=p_thread and not hidden and deleted_at is null order by created_at,id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),100000))) c;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 return result;
end $$;

create or replace function public.anonymous_posts(p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by p.created_at desc,p.id desc),'[]'::jsonb) from
 (select * from public.posts where status='published' and deleted_at is null and ggo_private.community_board_visible(topic) and (p_before is null or (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
$$;

create or replace function public.site_admin_post_action(p_id uuid,p_action text,p_topic text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.posts where id=p_id for update;if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 if p_action='hide' then update public.posts set status='hidden',auto_hidden=false where id=p_id;
 elsif p_action='restore' then update public.posts set status='published',auto_hidden=false,deleted_at=null where id=p_id;
 elsif p_action='delete' then update public.posts set status='hidden',auto_hidden=false,deleted_at=now() where id=p_id;
 elsif p_action='category' and ggo_private.community_board_visible(p_topic) then update public.posts set community_prefix_id=case when topic=p_topic then community_prefix_id end, community_pin_rank=case when topic=p_topic then community_pin_rank end, topic=p_topic,updated_at=now() where id=p_id;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.post.'||p_action,p_id::text);
end $$;

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
   insert into public.posts(user_id,ip_address,title,caption,image_path,topic,community_prefix_id) values(p_actor,p_ip,btrim(p_data->>'title'),btrim(p_data->>'body'),'',coalesce(p_data->>'topic','자유'),nullif(p_data->>'prefix_id','')::uuid) returning id into target;
 elsif p_action in ('post.update','post.delete') then
   target=(p_data->>'id')::uuid;
   perform 1 from public.posts where id=target and user_id=p_actor and status='published' and deleted_at is null and not community_notice and ggo_private.community_board_visible(topic) for update;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='post.update' then
    if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
    update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),
      community_prefix_id=case when p_data ? 'prefix_id' then nullif(p_data->>'prefix_id','')::uuid
                               when coalesce(p_data->>'topic',topic)=topic then community_prefix_id end,
      community_pin_rank=case when coalesce(p_data->>'topic',topic)=topic then community_pin_rank end,
      topic=coalesce(p_data->>'topic',topic),updated_at=now() where id=target;
   else update public.posts set status='hidden',deleted_at=now(),updated_at=now() where id=target; end if;
 elsif p_action='comment.create' then
   thread=(p_data->>'post_id')::uuid; parent=nullif(p_data->>'parent_id','')::uuid;
   perform 1 from public.posts where id=thread and status='published' and deleted_at is null and ggo_private.community_board_visible(topic) for share;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if parent is not null and not exists(select 1 from public.comments where id=parent and post_id=thread and not hidden and deleted_at is null) then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
   insert into public.comments(post_id,user_id,ip_address,body,parent_id) values(thread,p_actor,p_ip,btrim(p_data->>'body'),parent) returning id into target;
 elsif p_action in ('comment.update','comment.delete') then
   target=(p_data->>'id')::uuid;
   select post_id into thread from public.comments where id=target;
   perform 1 from public.posts where id=thread and status='published' and deleted_at is null and ggo_private.community_board_visible(topic) for share;
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
