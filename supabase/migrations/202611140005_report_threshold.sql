-- Prepared only; not applied to a live project. Account-based deduplication and
-- threshold enforcement live in the database, not a client-supplied count.
begin;
alter table public.reports drop constraint reports_reporter_id_post_id_key;
create unique index reports_one_post_per_member on public.reports(reporter_id,post_id) where comment_id is null;
create unique index reports_one_comment_per_member on public.reports(reporter_id,comment_id) where comment_id is not null;
alter table public.posts add column report_count integer not null default 0;
alter table public.posts add column auto_hidden boolean not null default false;
update public.posts p set report_count=(select count(distinct r.reporter_id) from public.reports r where r.post_id=p.id and r.comment_id is null);
update public.posts set status='hidden',auto_hidden=true where report_count>=50 and status='published';

create function public.count_post_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.comment_id is null then
    -- Atomic row update serializes concurrent reporters. Duplicate inserts fail
    -- the unique index before this AFTER trigger and never increment the count.
    update public.posts set report_count=report_count+1,
      status=case when report_count+1=50 then 'hidden' else status end,
      auto_hidden=case when report_count+1=50 then true else auto_hidden end
      where id=new.post_id;
  end if;
  return new;
end;
$$;
revoke all on function public.count_post_report() from public,anon,authenticated;
create trigger reports_after_insert after insert on public.reports for each row execute function public.count_post_report();

create or replace function public.moderate_report(p_report_id uuid,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare report_row public.reports;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('hidden','dismissed') then raise exception '처리 방식을 확인해 주세요.'; end if;
  select * into report_row from public.reports where id=p_report_id for update;
  if not found then raise exception '신고를 찾을 수 없습니다.'; end if;
  if report_row.status<>'pending' then raise exception '이미 처리된 신고입니다.'; end if;
  if report_row.comment_id is null then
    if p_decision='hidden' then update public.posts set status='hidden',auto_hidden=false where id=report_row.post_id;
    else update public.posts set status='published',auto_hidden=false where id=report_row.post_id and auto_hidden; end if;
  elsif p_decision='hidden' then
    update public.comments set hidden=true where id=report_row.comment_id and post_id=report_row.post_id;
  end if;
  update public.reports set status='reviewed',action=p_decision,reviewed_at=now()
    where post_id=report_row.post_id and comment_id is not distinct from report_row.comment_id and status='pending';
end;
$$;

create function public.restore_reported_content(p_report_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare report_row public.reports;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.' using errcode='42501'; end if;
  select * into report_row from public.reports where id=p_report_id;
  if not found then raise exception '신고를 찾을 수 없습니다.'; end if;
  if report_row.comment_id is null then update public.posts set status='published',auto_hidden=false where id=report_row.post_id;
  else update public.comments set hidden=false where id=report_row.comment_id and post_id=report_row.post_id; end if;
  update public.reports set status='reviewed',action='dismissed',reviewed_at=now()
    where post_id=report_row.post_id and comment_id is not distinct from report_row.comment_id and (status='pending' or action='hidden');
  -- Keep original reports and the cumulative count. The same member cannot
  -- report again, and an explicit operator restoration is not undone at 51.
end;
$$;
revoke all on function public.restore_reported_content(uuid) from public,anon,authenticated;
grant execute on function public.restore_reported_content(uuid) to authenticated;
commit;
