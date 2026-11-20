begin;
do $$
declare adm uuid=gen_random_uuid(); a uuid=gen_random_uuid(); b uuid=gen_random_uuid(); p uuid; c uuid; d jsonb; protected boolean=false;
begin
 insert into auth.users(id,email,raw_app_meta_data) values(adm,adm||'@example.invalid','{"provider":"google"}'),(a,a||'@example.invalid','{"provider":"google"}'),(b,b||'@example.invalid','{"provider":"google"}');
 insert into auth.identities(id,user_id,provider_id,provider,identity_data) select gen_random_uuid(),id,id::text,'google',jsonb_build_object('sub',id::text) from auth.users where id in (adm,a,b);
 update public.profiles set role='admin' where id=adm;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform public.editorial_save('news','{"id":"integration-news","title":"Integration news","body":"Test body","category":"Test","image":"/images/friends.jpg"}');
 perform public.editorial_save('event','{"id":"integration-event","title":"Integration event","description":"Test body","label":"Test","location":"Test location","status":"기획 중","image":"/images/friends.jpg"}');
 perform set_config('request.jwt.claim.sub',a::text,true);
 c=public.news_comment('integration-news','Member A');
 perform public.event_react('integration-event','like');
 if public.event_my_reactions()->>'integration-event'<>'like' then raise exception 'reaction not persisted'; end if;
 begin perform public.editorial_save('news','{}'); exception when insufficient_privilege then protected=true; end;
 if not protected then raise exception 'non-admin save succeeded'; end if;
 protected=false;
 p=(public.anonymous_trusted_write(a,null,'post.create','{"title":"Test post","body":"Test body","topic":"애니메이션"}')->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if public.event_my_reactions()?'integration-event' then raise exception 'reaction leaked between accounts'; end if;
 perform public.news_comment('integration-news','Member B');
 begin perform public.anonymous_trusted_write(b,null,'post.update',jsonb_build_object('id',p,'title','Changed','body','Bad update')); exception when no_data_found then protected=true; end;
 if not protected then raise exception 'other member changed post'; end if;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform public.news_comment_delete(c);
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.news_comment('integration-news','Member A again');
 d=public.editorial_list('news');
 select value into d from jsonb_array_elements(d) where value->>'id'='integration-news';
 if d::text like '%user_id%' or d::text like '%ownerKey%' or d::text like '%'||a::text||'%' then raise exception 'identity leaked'; end if;
 if d->'comments'->0->>'number'<>'2' or d->'comments'->1->>'number'<>'1' then
 -- now() is transaction-scoped; ordering ties use UUID, so compare by body.
 if not exists(select 1 from jsonb_array_elements(d->'comments') x where x->>'text'='Member A again' and x->>'number'='1') or not exists(select 1 from jsonb_array_elements(d->'comments') x where x->>'text'='Member B' and x->>'number'='2') then raise exception 'anonymous number changed'; end if;
 end if;
 update public.profiles set status='banned' where id=a;
 protected=false;
 begin perform public.news_comment('integration-news','Banned write'); exception when insufficient_privilege then protected=true; end;
 if not protected then raise exception 'banned member wrote'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 protected=false;
 begin perform public.editorial_delete('event','integration-event'); exception when insufficient_privilege then protected=true; end;
 if not protected then raise exception 'guest deletion succeeded'; end if;
 if has_function_privilege('anon','public.anonymous_trusted_write(uuid,inet,text,jsonb)','execute') or has_function_privilege('authenticated','public.anonymous_trusted_write(uuid,inet,text,jsonb)','execute') then raise exception 'trusted endpoint exposed'; end if;
 if has_table_privilege('anon','ggo_private.news_comments','select') or has_table_privilege('authenticated','ggo_private.news_authors','select') then raise exception 'private mapping exposed'; end if;
end $$;
rollback;
select 'PASS: persistence, isolated reactions, admin-only edits, stable anonymous numbers, ownership, banned users, private mappings; test data rolled back' as result;
