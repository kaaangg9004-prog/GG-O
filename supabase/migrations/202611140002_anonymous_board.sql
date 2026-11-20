-- Anonymous board foundation. Not applied to a live project in this task.
-- Run after 001. Public queries must never return ownership identifiers.
begin;

alter table public.posts add column title text;
update public.posts set title=left(caption,100) where title is null;
alter table public.posts alter column title set not null;
alter table public.posts add constraint posts_title_check check(char_length(trim(title)) between 2 and 100);
alter table public.posts drop constraint posts_caption_check;
alter table public.posts add constraint posts_caption_check check(char_length(trim(caption)) between 3 and 3000);
alter table public.posts drop constraint posts_topic_check;
update public.posts set topic=case topic when 'Style' then '패션' when 'Beauty' then '뷰티' else '자유' end;
alter table public.posts add constraint posts_topic_check check(topic in ('자유','뷰티','패션','케이팝','정보'));
alter table public.comments add column hidden boolean not null default false;
alter table public.products add column variant_images jsonb not null default '{}'::jsonb;
alter table public.reports add column comment_id uuid references public.comments(id) on delete cascade;
alter table public.reports add column action text check(action in ('hidden','dismissed'));
alter table public.reports add column reviewed_at timestamptz;

-- A profile/like/follow list must not become a backdoor for identity discovery.
revoke select on public.posts,public.comments,public.profiles,public.likes from anon,authenticated;
revoke all on public.follows from anon,authenticated;
drop policy follows_read on public.follows;
drop policy follows_insert_self on public.follows;
drop policy follows_delete_self on public.follows;
drop policy profiles_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using(id=(select auth.uid()));
grant select on public.profiles to authenticated;

grant select(id,title,caption,image_path,topic,tags,status,created_at) on public.posts to anon,authenticated;
grant select(id,post_id,body,created_at) on public.comments to anon,authenticated;
grant update(title) on public.posts to authenticated;
-- Random media object names avoid correlating posts through UUID folder names.
-- Public bucket delivery still works; metadata/object listing is owner-only.
drop policy community_media_read on storage.objects;
drop policy community_media_insert on storage.objects;
drop policy community_media_delete on storage.objects;
create policy community_media_owner_read on storage.objects for select to authenticated using(bucket_id='community-media' and owner_id=(select auth.uid())::text);
create policy community_media_insert on storage.objects for insert to authenticated with check(bucket_id='community-media' and owner_id=(select auth.uid())::text and name ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$');
create policy community_media_delete on storage.objects for delete to authenticated using(bucket_id='community-media' and owner_id=(select auth.uid())::text);
drop policy posts_insert_self on public.posts;
drop policy posts_update_self on public.posts;
create policy posts_insert_self on public.posts for insert to authenticated with check(user_id=(select auth.uid()) and status='published' and (image_path='' or exists(select 1 from storage.objects o where o.bucket_id='community-media' and o.name=image_path and o.owner_id=(select auth.uid())::text)));
create policy posts_update_self on public.posts for update to authenticated using(user_id=(select auth.uid()) and status='published') with check(user_id=(select auth.uid()) and status='published' and (image_path='' or exists(select 1 from storage.objects o where o.bucket_id='community-media' and o.name=image_path and o.owner_id=(select auth.uid())::text)));
drop policy comments_read on public.comments;
create policy comments_read on public.comments for select using(not hidden and exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
drop policy comments_insert_self on public.comments;
create policy comments_insert_self on public.comments for insert to authenticated with check(user_id=(select auth.uid()) and not hidden and exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
drop policy reports_insert_self on public.reports;
create policy reports_insert_self on public.reports for insert to authenticated with check(
  reporter_id=(select auth.uid()) and status='pending' and action is null and reviewed_at is null
  and (comment_id is null or exists(select 1 from public.comments c where c.id=comment_id and c.post_id=reports.post_id))
);

-- This narrow, owner-executed view exposes aggregate counts only, no member IDs.
create view public.public_post_stats with (security_barrier=true) as
  select p.id as post_id,count(l.user_id)::integer as likes
  from public.posts p left join public.likes l on l.post_id=p.id
  where p.status='published' group by p.id;
revoke all on public.public_post_stats from public,anon,authenticated;
grant select on public.public_post_stats to anon,authenticated;

create function public.moderate_report(p_report_id uuid,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare report_row public.reports;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('hidden','dismissed') then raise exception '처리 방식을 확인해 주세요.'; end if;
  select * into report_row from public.reports where id=p_report_id for update;
  if not found then raise exception '신고를 찾을 수 없습니다.'; end if;
  if report_row.status<>'pending' then raise exception '이미 처리된 신고입니다.'; end if;
  if p_decision='hidden' then
    if report_row.comment_id is null then update public.posts set status='hidden' where id=report_row.post_id;
    else update public.comments set hidden=true where id=report_row.comment_id and post_id=report_row.post_id; end if;
  end if;
  update public.reports set status='reviewed',action=p_decision,reviewed_at=now() where id=p_report_id;
end;
$$;
revoke all on function public.moderate_report(uuid,text) from public,anon,authenticated;
grant execute on function public.moderate_report(uuid,text) to authenticated;
create index reports_comment_idx on public.reports(comment_id) where comment_id is not null;
commit;
