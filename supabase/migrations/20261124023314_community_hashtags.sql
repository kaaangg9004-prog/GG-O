create function ggo_private.parse_community_hashtags(p_input text) returns text[]
language plpgsql immutable set search_path='' as $$
declare
  tags text[];
begin
  if char_length(coalesce(p_input,'')) > 200 then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  select coalesce(array_agg(label order by ord), '{}'::text[]) into tags
  from (
    select distinct on (lower(label)) label, ord
    from regexp_split_to_table(coalesce(p_input,''), '[[:space:],#]+') with ordinality as token(label, ord)
    where label <> ''
    order by lower(label), ord
  ) deduplicated;
  if cardinality(tags) > 6 or exists (
    select 1 from unnest(tags) as tag(label) where char_length(label) > 24 or label ~ '[[:cntrl:]]'
  ) then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  return tags;
end;
$$;
revoke all on function ggo_private.parse_community_hashtags(text) from public,anon,authenticated;

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
   insert into public.posts(user_id,ip_address,title,caption,image_path,topic,community_prefix_id,community_body_size,community_body_color,community_images,tags) values(p_actor,p_ip,btrim(p_data->>'title'),btrim(p_data->>'body'),'',coalesce(p_data->>'topic','자유'),nullif(p_data->>'prefix_id','')::uuid,p_data->>'body_size',p_data->>'body_color',ggo_private.validate_community_images(p_actor,btrim(p_data->>'body'),coalesce(p_data->'images','[]'::jsonb)),ggo_private.parse_community_hashtags(p_data->>'hashtags')) returning id into target;
 elsif p_action in ('post.update','post.delete') then
   target=(p_data->>'id')::uuid;
   perform 1 from public.posts where id=target and user_id=p_actor and status='published' and deleted_at is null and not community_notice and ggo_private.community_board_visible(topic) for update;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='post.update' then
    if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
    update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),
      community_body_size=case when p_data ? 'body_size' then p_data->>'body_size' else community_body_size end,
      tags=case when p_data ? 'hashtags' then ggo_private.parse_community_hashtags(p_data->>'hashtags') else tags end,
      community_images=case when p_data ? 'images' then ggo_private.validate_community_images(p_actor,btrim(p_data->>'body'),p_data->'images') else community_images end,
      community_body_color=case when p_data ? 'body_color' then p_data->>'body_color' else community_body_color end,
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

create or replace function public.anonymous_feed(p_filter text default '전체',p_limit integer default 30,p_before timestamptz default null,p_before_id uuid default null,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
 if p_filter is null or (p_filter not in ('전체','hot') and not ggo_private.community_board_visible(p_filter)) or char_length(coalesce(p_query,''))>100 then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
 select coalesce(jsonb_agg(ggo_private.post_json(p) order by case when p_filter='hot' then ggo_private.top_score(p) end desc nulls last,p.created_at desc,p.id desc),'[]'::jsonb) into result from
 (select * from public.posts t where t.status='published' and t.deleted_at is null and ggo_private.community_board_visible(t.topic) and (p_filter='전체' or p_filter='hot' and ggo_private.is_hot(t) or t.topic=p_filter)
 and (
   coalesce(btrim(p_query),'')=''
   or position(lower(btrim(p_query)) in lower(t.title||' '||coalesce((select label from ggo_private.community_prefixes where id=t.community_prefix_id),'')||case when auth.uid() is null then '' else ' '||t.caption end))>0
   or exists (
     select 1 from unnest(t.tags) tag
     where case when left(btrim(p_query),1)='#'
       then lower(ltrim(tag,'#'))=lower(substr(btrim(p_query),2))
       else position(lower(btrim(p_query)) in lower(ltrim(tag,'#')))>0
     end
   )
 )
 and (p_filter='hot' or p_before is null or (t.created_at,t.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by case when p_filter='hot' then ggo_private.top_score(t) end desc nulls last,t.created_at desc,t.id desc limit greatest(1,least(coalesce(p_limit,30),50))) p;
 return result;
end $$;
