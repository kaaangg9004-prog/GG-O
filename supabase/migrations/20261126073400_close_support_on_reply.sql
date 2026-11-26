update public.support_tickets set status='answered' where status='in_progress';
alter table public.support_tickets drop constraint support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check check (status in ('waiting','answered'));
drop function public.complete_support_ticket(uuid);

create or replace function public.reply_support_ticket(p_ticket_id uuid,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception '운영자만 답변을 등록할 수 있습니다.' using errcode='42501';
  end if;
  if p_body is null or char_length(trim(p_body)) not between 2 and 5000 then
    raise exception '답변은 2~5,000자로 입력해 주세요.';
  end if;
  select status into current_status from public.support_tickets where id=p_ticket_id for update;
  if not found then raise exception '문의를 찾을 수 없습니다.'; end if;
  if current_status='answered' then raise exception '이미 답변 완료된 문의입니다.'; end if;
  insert into public.support_replies(ticket_id,user_id,body) values(p_ticket_id,auth.uid(),trim(p_body));
  update public.support_tickets set status='answered',updated_at=now() where id=p_ticket_id;
end;
$$;
