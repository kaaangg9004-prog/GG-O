-- Apply after 009. Guests may browse summaries; reading content requires a session.
-- Keep anonymous author privacy unchanged for members and administrators.
begin;

-- Public feeds contain metadata only for guests. No post body or attachment URL.
create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',case when auth.uid() is null then '' else p.caption end,'image_path',case when auth.uid() is null then '' else p.image_path end,'topic',p.topic,'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
$$;

-- Guest search cannot probe hidden body text.
create or replace function public.anonymous_feed(p_filter text default '전체',p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_filter is null or p_filter not in ('전체','hot','자유','밈','연예인','취미','패션','음악') or char_length(coalesce(p_query,''))>100 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by case when p_filter='hot' then ggo_private.top_score(p) end desc nulls last,p.created_at desc,p.id desc),'[]'::jsonb) into result from
 (select * from public.posts t where t.status='published' and t.deleted_at is null and (p_filter='전체' or p_filter='hot' and ggo_private.is_hot(t) or t.topic=p_filter)
 and (coalesce(p_query,'')='' or position(lower(p_query) in lower(t.title||case when auth.uid() is null then '' else ' '||t.caption end))>0)
 and (p_filter='hot' or p_before is null or (t.created_at,t.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by case when p_filter='hot' then ggo_private.top_score(t) end desc nulls last,t.created_at desc,t.id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
 return result;
end $$;

create or replace function public.anonymous_post(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare p public.posts; begin
 if auth.uid() is null then raise exception 'GGO_AUTH_REQUIRED' using errcode='42501'; end if;
 select * into p from public.posts where id=p_id and status='published' and deleted_at is null;
 if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 return ggo_private.post_json(p);
end $$;

create or replace function public.anonymous_comments(p_kind text,p_thread text,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if auth.uid() is null then raise exception 'GGO_AUTH_REQUIRED' using errcode='42501'; end if;
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
 if auth.uid() is null then raise exception 'GGO_AUTH_REQUIRED' using errcode='42501'; end if;
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

revoke all on function public.anonymous_post(uuid),public.anonymous_comments(text,text,integer,integer),public.poll_open(text) from public,anon,authenticated;
grant execute on function public.anonymous_post(uuid),public.anonymous_comments(text,text,integer,integer),public.poll_open(text) to authenticated;
-- Summary endpoints remain available for browsing, including TOP rankings.
revoke all on function public.anonymous_posts(integer,timestamptz,uuid),public.anonymous_feed(text,integer,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.anonymous_posts(integer,timestamptz,uuid),public.anonymous_feed(text,integer,timestamptz,uuid,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
