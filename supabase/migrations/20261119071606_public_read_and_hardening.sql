-- Restore the public reading experience while keeping author identities private.
create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'image_path',p.image_path,'topic',p.topic,'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
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
create or replace function public.magazine_open(p_id text) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare doc jsonb; begin

 select document into doc from ggo_private.magazine_articles where id=p_id and active;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 return doc;
end $$;
grant execute on function public.anonymous_post(uuid),public.anonymous_comments(text,text,integer,integer),public.poll_open(text),public.magazine_open(text) to anon,authenticated;
create or replace function public.poll_vote(p_id text,p_revision integer,p_answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare poll public.polls; q jsonb;
begin
  if auth.uid() is null then raise exception '로그인 후 이용해 주세요.' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.uid() for update;
  if not public.anonymous_can_write() then raise exception 'GGO_MEMBER_RESTRICTED' using errcode='42501'; end if;
  select * into poll from public.polls where id=p_id and active for update;
  if not found then raise exception '투표글을 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.poll_ballots where poll_id=p_id and user_id=auth.uid()) then return public.poll_open(p_id); end if;
  if p_revision is distinct from poll.revision then raise exception '투표글이 변경되었습니다. 다시 열어 주세요.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception '모든 항목에서 보기 하나씩 선택해 주세요.'; end if;
  if (select count(*) from jsonb_object_keys(p_answers))<>jsonb_array_length(poll.document->'questions') then raise exception '모든 항목에서 보기 하나씩 선택해 주세요.'; end if;
  for q in select value from jsonb_array_elements(poll.document->'questions') loop
    if jsonb_typeof(p_answers->(q->>'id')) is distinct from 'string' or not exists(select 1 from jsonb_array_elements(q->'options') opt where opt->>'id'=p_answers->>(q->>'id')) then raise exception '모든 항목에서 보기 하나씩 선택해 주세요.'; end if;
  end loop;
  insert into public.poll_ballots(poll_id,user_id,answers,revision) values(p_id,auth.uid(),p_answers,poll.revision);
  return public.poll_open(p_id);
end; $$;
-- Index foreign-key lookups used by account deletion and moderation.
do $$ declare r record; cols text; begin
 for r in select conrelid,conname,conkey from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and n.nspname in ('public','ggo_private') and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] @> c.conkey) loop
 select string_agg(quote_ident(attname),',' order by array_position(r.conkey,attnum)) into cols from pg_attribute where attrelid=r.conrelid and attnum=any(r.conkey);
 execute format('create index if not exists %I on %s (%s)',left(r.conname,50)||'_idx',r.conrelid::regclass,cols);
 end loop;
end $$;
notify pgrst, 'reload schema';
