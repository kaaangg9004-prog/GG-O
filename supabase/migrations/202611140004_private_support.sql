-- Prepared only. Run after 001-003 in the selected Supabase project.
-- Bodies, password hashes, replies and lockout records have NO client table grants.
-- Only narrowly authorized functions return support data.
begin;
create extension if not exists pgcrypto with schema extensions;

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 2 and 100),
  category text not null check(category in ('일반 문의','상품 문의','주문·배송','교환·반품','회원·이용')),
  body text not null check(char_length(trim(body)) between 10 and 5000),
  password_hash text not null,
  status text not null default 'waiting' check(status in ('waiting','answered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.support_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null check(char_length(trim(body)) between 2 and 5000),
  created_at timestamptz not null default now()
);
create table public.support_unlock_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  failures integer not null default 0,
  locked_until timestamptz,
  primary key(user_id,ticket_id)
);
alter table public.support_tickets enable row level security;
alter table public.support_replies enable row level security;
alter table public.support_unlock_attempts enable row level security;
revoke all on public.support_tickets,public.support_replies,public.support_unlock_attempts from public,anon,authenticated;

create function public.support_ticket_json(p_ticket public.support_tickets)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',(p_ticket).id,'title',(p_ticket).title,'category',(p_ticket).category,
    'ownerId',(p_ticket).user_id,'authorId',p.handle,'createdAt',(p_ticket).created_at,
    'updatedAt',(p_ticket).updated_at,'status',(p_ticket).status)
  from public.profiles p where p.id=(p_ticket).user_id;
$$;
revoke all on function public.support_ticket_json(public.support_tickets) from public,anon,authenticated;

create function public.list_support_tickets(p_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  if p_all is true and not public.is_admin() then raise exception '운영자 권한이 필요합니다.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(public.support_ticket_json(t::public.support_tickets) order by t.created_at desc),'[]'::jsonb) into result
  from (select * from public.support_tickets where user_id=(select auth.uid()) or (p_all is true and public.is_admin()) order by created_at desc limit 100) t;
  return result;
end;
$$;

create function public.create_support_ticket(p_title text,p_body text,p_category text,p_password text)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  if p_password is null or char_length(p_password)<6 or octet_length(p_password)>72 then raise exception '글 비밀번호는 6자 이상, 72바이트 이하로 입력해 주세요.'; end if;
  if p_title is null or char_length(trim(p_title)) not between 2 and 100 then raise exception '제목은 2~100자로 입력해 주세요.'; end if;
  if p_body is null or char_length(trim(p_body)) not between 10 and 5000 then raise exception '문의 내용은 10~5,000자로 입력해 주세요.'; end if;
  if p_category is null or p_category not in ('일반 문의','상품 문의','주문·배송','교환·반품','회원·이용') then raise exception '문의 분류를 확인해 주세요.'; end if;
  -- Serialize each member's creation limit against parallel requests.
  perform 1 from public.profiles where id=(select auth.uid()) for update;
  if not found then raise exception '회원 정보를 찾을 수 없습니다.'; end if;
  if (select count(*) from public.support_tickets where user_id=(select auth.uid()) and created_at>now()-interval '1 hour')>=10 then raise exception '문의가 너무 많습니다. 잠시 후 다시 작성해 주세요.'; end if;
  insert into public.support_tickets(user_id,title,body,category,password_hash)
    values((select auth.uid()),trim(p_title),trim(p_body),p_category,extensions.crypt(p_password,extensions.gen_salt('bf',12))) returning id into new_id;
  return new_id;
end;
$$;

create function public.open_support_ticket(p_ticket_id uuid,p_password text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets; attempt public.support_unlock_attempts; answers jsonb;
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  select * into ticket from public.support_tickets where id=p_ticket_id and (user_id=(select auth.uid()) or public.is_admin());
  if not found then raise exception '문의를 찾을 수 없거나 확인 권한이 없습니다.' using errcode='42501'; end if;
  if not public.is_admin() then
    insert into public.support_unlock_attempts(user_id,ticket_id) values((select auth.uid()),ticket.id) on conflict do nothing;
    select * into attempt from public.support_unlock_attempts where user_id=(select auth.uid()) and ticket_id=ticket.id for update;
    if attempt.locked_until>now() then return jsonb_build_object('error','비밀번호 확인 횟수를 초과했습니다. 10분 뒤 다시 시도해 주세요.'); end if;
    if attempt.locked_until is not null then
      update public.support_unlock_attempts set failures=0,locked_until=null where user_id=(select auth.uid()) and ticket_id=ticket.id;
      attempt.failures:=0;
    end if;
    if p_password is null or octet_length(p_password)>72 or extensions.crypt(p_password,ticket.password_hash)<>ticket.password_hash then
      update public.support_unlock_attempts set failures=attempt.failures+1,locked_until=case when attempt.failures+1>=5 then now()+interval '10 minutes' else null end where user_id=(select auth.uid()) and ticket_id=ticket.id;
      -- Return instead of raising: the failure counter must commit.
      return jsonb_build_object('error','글 비밀번호가 일치하지 않습니다.');
    end if;
    delete from public.support_unlock_attempts where user_id=(select auth.uid()) and ticket_id=ticket.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'authorId',p.handle,'body',r.body,'createdAt',r.created_at) order by r.created_at),'[]'::jsonb) into answers
    from public.support_replies r join public.profiles p on p.id=r.user_id where r.ticket_id=ticket.id;
  return jsonb_build_object('ticket',public.support_ticket_json(ticket),'body',ticket.body,'replies',answers);
end;
$$;

create function public.reply_support_ticket(p_ticket_id uuid,p_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then raise exception '운영자만 답변을 등록할 수 있습니다.' using errcode='42501'; end if;
  if p_body is null or char_length(trim(p_body)) not between 2 and 5000 then raise exception '답변은 2~5,000자로 입력해 주세요.'; end if;
  perform 1 from public.support_tickets where id=p_ticket_id for update;
  if not found then raise exception '문의를 찾을 수 없습니다.'; end if;
  insert into public.support_replies(ticket_id,user_id,body) values(p_ticket_id,(select auth.uid()),trim(p_body));
  update public.support_tickets set status='answered',updated_at=now() where id=p_ticket_id;
end;
$$;

create function public.support_member_details(p_member_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; purchases jsonb;
begin
  if (select auth.uid()) is null or (p_member_id is distinct from (select auth.uid()) and not public.is_admin()) then raise exception '회원 정보를 볼 권한이 없습니다.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'createdAt',o.created_at,'status',o.status,'subtotal',o.total_vnd,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'productName',i.product_name,'variant',i.variant,'variantLabel',i.variant,'quantity',i.quantity,'unitPrice',i.unit_price_vnd)),'[]'::jsonb) from public.order_items i where i.order_id=o.id)) order by o.created_at desc),'[]'::jsonb) into purchases
    from (select * from public.orders where user_id=p_member_id and status in ('paid','processing','shipped','delivered','refunded') order by created_at desc limit 50) o;
  select jsonb_build_object('id',p.id,'handle',p.handle,'joinedAt',u.created_at,'demo',false,'orders',purchases) into result
    from public.profiles p join auth.users u on u.id=p.id where p.id=p_member_id;
  if result is null then raise exception '회원 정보를 찾을 수 없습니다.'; end if;
  return result;
end;
$$;

revoke all on function public.list_support_tickets(boolean),public.create_support_ticket(text,text,text,text),public.open_support_ticket(uuid,text),public.reply_support_ticket(uuid,text),public.support_member_details(uuid) from public,anon,authenticated;
grant execute on function public.list_support_tickets(boolean),public.create_support_ticket(text,text,text,text),public.open_support_ticket(uuid,text),public.reply_support_ticket(uuid,text),public.support_member_details(uuid) to authenticated;
create index support_member_idx on public.support_tickets(user_id,created_at desc);
create index support_queue_idx on public.support_tickets(status,created_at desc);
create index support_replies_ticket_idx on public.support_replies(ticket_id,created_at);
commit;
