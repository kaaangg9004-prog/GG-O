alter table public.posts add column community_images jsonb not null default '[]'::jsonb;
alter table public.posts drop constraint if exists posts_caption_check;
alter table public.posts add constraint posts_caption_check check (
  char_length(trim(caption)) <= 3000 and
  (char_length(trim(caption)) >= 3 or community_images <> '[]'::jsonb)
);
create index posts_community_images on public.posts using gin (community_images jsonb_path_ops)
  where community_images <> '[]'::jsonb and status='published' and deleted_at is null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('community-inline-media','community-inline-media',false,1048576,array['image/webp','image/png','image/jpeg']);

create function ggo_private.community_image_visible(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.posts p
    where p.status='published' and p.deleted_at is null and p.community_images <> '[]'::jsonb
      and p.community_images @> jsonb_build_array(jsonb_build_object('path',p_path))
      and ggo_private.community_board_visible(p.topic)
  );
$$;

revoke all on function ggo_private.community_image_visible(text) from public,anon,authenticated;
grant execute on function ggo_private.community_image_visible(text) to anon,authenticated;

create policy community_inline_media_read on storage.objects for select to anon, authenticated
using (bucket_id='community-inline-media' and (owner_id=(select auth.uid())::text or ggo_private.community_image_visible(name)));

create policy community_inline_media_upload on storage.objects for insert to authenticated
with check (bucket_id='community-inline-media' and owner_id=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}\.(webp|png|jpg)$' and (select public.anonymous_can_write()));

create function ggo_private.validate_community_images(p_actor uuid, p_body text, p_images jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  item jsonb;
  last_offset integer := 0;
  image_offset integer;
begin
  if jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  if jsonb_array_length(p_images)>4 then
    raise exception 'GGO_INVALID_INPUT' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_images) loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'path','') !~ '^[0-9a-f-]{36}\.(webp|png|jpg)$'
      or coalesce(item->>'offset','') !~ '^[0-9]{1,4}$'
      or coalesce(item->>'width','') !~ '^[0-9]{2,3}$' then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    image_offset := (item->>'offset')::integer;
    if image_offset < last_offset or image_offset > char_length(p_body)
      or (item->>'width')::integer not between 25 and 100
      or not exists (select 1 from storage.objects where bucket_id='community-inline-media' and name=item->>'path' and owner_id=p_actor::text)
    then
      raise exception 'GGO_INVALID_INPUT' using errcode='22023';
    end if;
    last_offset := image_offset;
  end loop;
  return p_images;
end;
$$;
revoke all on function ggo_private.validate_community_images(uuid,text,jsonb) from public,anon,authenticated;

create or replace function ggo_private.post_json(p public.posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'body',p.caption,'body_size',p.community_body_size,'body_color',p.community_body_color,'images',p.community_images,'image_path',p.image_path,'topic',p.topic,'notice',p.community_notice,'pin_rank',p.community_pin_rank,
 'prefix',(select jsonb_build_object('id',x.id,'label',x.label,'color',case when x.label='공지' then (select notice_color from ggo_private.community_boards where name=p.topic) else x.color end) from ggo_private.community_prefixes x where x.id=p.community_prefix_id),
 'notice_color',case when p.community_notice then (select notice_color from ggo_private.community_boards where name=p.topic) end,
 'tags',p.tags,'created_at',p.created_at,'updated_at',p.updated_at,'views',p.view_count,'score',ggo_private.top_score(p),'is_hot',ggo_private.is_hot(p),
 'comment_count',(select count(*) from public.comments c where c.post_id=p.id and not c.hidden and c.deleted_at is null),'is_mine',coalesce(p.user_id=auth.uid(),false),'author_label','Ẩn danh (Tác giả)');
$$;

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
   insert into public.posts(user_id,ip_address,title,caption,image_path,topic,community_prefix_id,community_body_size,community_body_color,community_images) values(p_actor,p_ip,btrim(p_data->>'title'),btrim(p_data->>'body'),'',coalesce(p_data->>'topic','자유'),nullif(p_data->>'prefix_id','')::uuid,p_data->>'body_size',p_data->>'body_color',ggo_private.validate_community_images(p_actor,btrim(p_data->>'body'),coalesce(p_data->'images','[]'::jsonb))) returning id into target;
 elsif p_action in ('post.update','post.delete') then
   target=(p_data->>'id')::uuid;
   perform 1 from public.posts where id=target and user_id=p_actor and status='published' and deleted_at is null and not community_notice and ggo_private.community_board_visible(topic) for update;
   if not found then raise exception 'GGO_NOT_FOUND' using errcode='P0002'; end if;
   if p_action='post.update' then
    if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string' then raise exception 'GGO_INVALID_INPUT' using errcode='22023'; end if;
    update public.posts set title=btrim(p_data->>'title'),caption=btrim(p_data->>'body'),
      community_body_size=case when p_data ? 'body_size' then p_data->>'body_size' else community_body_size end,
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
