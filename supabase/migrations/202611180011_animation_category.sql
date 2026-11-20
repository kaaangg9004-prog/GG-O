-- Prepared for the existing Supabase backend; not applied without a connected project.
alter table public.posts drop constraint if exists posts_topic_check;
alter table public.posts add constraint posts_topic_check check(topic in ('자유','밈','연예인','취미','패션','음악','애니메이션'));
create or replace function public.anonymous_feed(p_filter text default '전체',p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_filter is null or p_filter not in ('전체','hot','자유','밈','연예인','취미','패션','음악','애니메이션') or char_length(coalesce(p_query,''))>100 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by case when p_filter='hot' then ggo_private.top_score(p) end desc nulls last,p.created_at desc,p.id desc),'[]'::jsonb) into result from
 (select * from public.posts t where t.status='published' and t.deleted_at is null and (p_filter='전체' or p_filter='hot' and ggo_private.is_hot(t) or t.topic=p_filter)
 and (coalesce(p_query,'')='' or position(lower(p_query) in lower(t.title||case when auth.uid() is null then '' else ' '||t.caption end))>0)
 and (p_filter='hot' or p_before is null or (t.created_at,t.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by case when p_filter='hot' then ggo_private.top_score(t) end desc nulls last,t.created_at desc,t.id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
 return result;
end $$;

create or replace function public.site_admin_post_action(p_id uuid,p_action text,p_topic text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'GGO_ADMIN_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.posts where id=p_id for update;if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
 if p_action='hide' then update public.posts set status='hidden',auto_hidden=false where id=p_id;
 elsif p_action='restore' then update public.posts set status='published',auto_hidden=false,deleted_at=null where id=p_id;
 elsif p_action='delete' then update public.posts set status='hidden',auto_hidden=false,deleted_at=now() where id=p_id;
 elsif p_action='category' and p_topic in ('자유','밈','연예인','취미','패션','음악','애니메이션') then update public.posts set topic=p_topic,updated_at=now() where id=p_id;
 else raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 insert into ggo_private.audit_log(actor_id,action,target_id) values(auth.uid(),'admin.post.'||p_action,p_id::text);
end $$;
