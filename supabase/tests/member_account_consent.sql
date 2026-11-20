begin;
select set_config('ggo.test_user_a',gen_random_uuid()::text,true),set_config('ggo.test_user_b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_app_meta_data)
select current_setting(k)::uuid,current_setting(k)||'@example.invalid','{"provider":"google"}'::jsonb from unnest(array['ggo.test_user_a','ggo.test_user_b']) k;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('ggo.test_user_a'),true);
insert into public.member_consents(user_id,version) values(auth.uid(),'2026-11-16') on conflict(user_id,version) do nothing;
insert into public.member_consents(user_id,version) values(auth.uid(),'2026-11-16') on conflict(user_id,version) do nothing;
do $$ begin
 if (select count(*) from public.member_consents)<>1 then raise exception 'consent not idempotent'; end if;
 begin
 insert into public.member_consents(user_id,version) values(current_setting('ggo.test_user_b')::uuid,'2026-11-16');
 raise exception 'other account write allowed';
 exception when insufficient_privilege then null; end;
 begin
 update public.member_consents set accepted_at=now();
 raise exception 'timestamp edit allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('ggo.test_user_b'),true);
do $$ begin if exists(select 1 from public.member_consents) then raise exception 'consent leaked'; end if; end $$;
set local role anon;
do $$ begin
 begin perform * from public.member_consents;raise exception 'guest read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
