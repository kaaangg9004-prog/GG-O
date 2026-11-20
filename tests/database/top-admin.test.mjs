import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),admin='a0000000-0000-4000-8000-000000000001',member='a0000000-0000-4000-8000-000000000002';
let first,second;const ip='203.0.113.51';
const path=new URL('../../supabase/migrations/',import.meta.url);
async function as(role,user,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}
const call=(user,name,args=[])=>as(user?'authenticated':'anon',user,()=>rpc(name,args));
const write=(user,action,data)=>as('service_role',null,()=>rpc('anonymous_trusted_write',[user,ip,action,data]));
const views=(id,hash)=>as('service_role',null,()=>rpc('anonymous_trusted_view',[id,hash]));
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}');create table auth.identities(user_id uuid references auth.users(id),provider text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`);
 await db.exec(readFileSync(new URL('202611160008_member_anonymity.sql',path),'utf8'));
 for(const id of [admin,member]){await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{\"provider\":\"google\"}')",[id,id+'@example.test']);await db.query("insert into auth.identities values($1,'google')",[id]);}
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 first=(await write(member,'post.create',{title:'이전 뷰티 게시글',body:'기존 글은 카테고리를 이전해도 유지합니다.',topic:'뷰티'})).id;
 await db.exec(readFileSync(new URL('202611160009_square_hot_admin.sql',path),'utf8'));
 second=(await write(member,'post.create',{title:'실시간 취미 글',body:'새로운 취미에 대한 이야기입니다.',topic:'취미'})).id;
});
after(()=>db.close());
test('legacy categories migrate; public filtered feeds contain no ownership/IP fields',async()=>{
 assert.equal((await call(null,'anonymous_post',[first])).topic,'패션');assert.equal((await call(null,'anonymous_feed',['취미']))[0].id,second);
 const data=await call(null,'anonymous_feed',['전체']);for(const key of ['user_id','ip_address','email'])assert.ok(!JSON.stringify(data).includes(key));assert.ok(!JSON.stringify(data).includes(member));
 await assert.rejects(()=>call(member,'anonymous_trusted_view',[first,'a'.repeat(64)]),/permission denied/);await assert.rejects(()=>as('anon',null,()=>db.query('select * from ggo_private.post_view_days')),/permission denied/);
});
test('trusted view counter deduplicates each viewer/day without resetting cumulative counts',async()=>{
 assert.equal((await views(first,'a'.repeat(64))).views,1);assert.equal((await views(first,'a'.repeat(64))).views,1);assert.equal((await views(first,'b'.repeat(64))).views,2);
 assert.equal((await call(null,'anonymous_post',[first])).views,2);await assert.rejects(()=>views(first,'invalid'),/GGO_INVALID_INPUT/);
});
test('TOP scores use comments and continuous decay; moderation updates eligibility immediately',async()=>{
 const settings=await call(null,'community_settings');assert.equal(settings.commentWeight,15);assert.equal(settings.halfLifeHours,24);
 await call(admin,'site_admin_settings',[{...settings,topMinScore:20}]);assert.equal((await call(null,'anonymous_feed',['hot'])).length,0);
 const c1=(await write(member,'comment.create',{post_id:first,body:'첫 댓글'})).id;await write(member,'comment.create',{post_id:first,body:'두 번째 댓글'});
 let rows=await call(null,'anonymous_feed',['hot']);assert.equal(rows[0].id,first);assert.ok(rows[0].score>31&&rows[0].score<=32);
 await call(admin,'site_admin_comment_action',[c1,'hide']);assert.equal((await call(null,'anonymous_feed',['hot'])).length,0);
 await call(admin,'site_admin_comment_action',[c1,'restore']);assert.equal((await call(null,'anonymous_feed',['hot']))[0].id,first);
 await db.query("update public.posts set created_at=now()-interval '24 hours' where id=$1",[first]);assert.equal((await call(null,'anonymous_feed',['hot'])).length,0);
 const old=(await call(null,'anonymous_post',[first])).score;assert.ok(old>15.99&&old<16.01);
 await call(admin,'site_admin_settings',[{...settings,topMinScore:10}]);assert.equal((await call(null,'anonymous_feed',['hot']))[0].id,first);
 await call(admin,'site_admin_post_action',[first,'hide',null]);assert.equal((await call(null,'anonymous_feed',['hot'])).length,0);await call(admin,'site_admin_post_action',[first,'restore',null]);
});
test('TOP ordering follows score rather than insertion order, and updates after new views/comments',async()=>{
 await db.query('update public.posts set view_count=100,created_at=now() where id=$1',[second]);let rows=await call(null,'anonymous_feed',['hot']);assert.equal(rows[0].id,second);
 for(let i=0;i<8;i++)await write(member,'comment.create',{post_id:first,body:'대화가 활발해집니다 '+i});
 rows=await call(null,'anonymous_feed',['hot']);assert.equal(rows[0].id,second,'old article still decays');await db.query('update public.posts set created_at=now() where id=$1',[first]);rows=await call(null,'anonymous_feed',['hot']);assert.equal(rows[0].id,first);
});
test('only administrators can access management RPCs, mutate settings or restrict members',async()=>{
 for(const [name,args] of [['site_admin_overview',[]],['site_admin_content',[]],['site_admin_members',[]],['site_admin_settings',[await call(null,'community_settings')]],['site_admin_post_action',[first,'delete',null]],['site_admin_member_action',[member,'ban']]])await assert.rejects(()=>call(member,name,args),/GGO_ADMIN_REQUIRED/);
 const members=await call(admin,'site_admin_members');assert.ok(members.find(m=>m.id===member).email);await assert.rejects(()=>call(admin,'site_admin_member_action',[admin,'ban']),/GGO_PROTECTED_ADMIN/);
 await call(admin,'site_admin_member_action',[member,'ban']);await assert.rejects(()=>write(member,'comment.create',{post_id:second,body:'차단 우회'}),/GGO_MEMBER_RESTRICTED/);await call(admin,'site_admin_member_action',[member,'restore']);assert.equal((await call(member,'anonymous_access')).can_write,true);
});
test('settings pause member writing, keep reads/admin actions, validate missing fields and preserve configuration on reapply',async()=>{
 const settings=await call(null,'community_settings');await assert.rejects(()=>call(admin,'site_admin_settings',[{...settings,halfLifeHours:0}]),/GGO_INVALID_INPUT/);await assert.rejects(()=>call(admin,'site_admin_settings',[{...settings,notice:{ko:''}}]),/GGO_INVALID_INPUT/);
 const paused={...settings,communityWritingEnabled:false,notice:{ko:'점검 안내',vi:'Thông báo',en:'Notice'}};await call(admin,'site_admin_settings',[paused]);assert.equal((await call(member,'anonymous_access')).can_write,false);assert.equal((await call(null,'anonymous_post',[second])).id,second);await assert.rejects(()=>write(member,'comment.create',{post_id:second,body:'중단 중'}),/GGO_MEMBER_RESTRICTED/);await write(admin,'comment.create',{post_id:second,body:'운영 공지'});
 await db.exec(readFileSync(new URL('202611160009_square_hot_admin.sql',path),'utf8'));assert.deepEqual(await call(null,'community_settings'),paused);await call(admin,'site_admin_settings',[{...paused,communityWritingEnabled:true}]);
});
test('magazine administration is protected and public summaries never include article bodies',async()=>{
 const article={id:'article-one',title:'운영자가 등록한 글',tag:'일상',excerpt:'짧은 소개',image:'/images/cafe.jpg',read:'3분',paragraphs:['공개 요약에는 포함하지 않는 매거진 본문입니다.']};
 await assert.rejects(()=>call(member,'site_admin_magazine',[article]),/GGO_ADMIN_REQUIRED/);await call(admin,'site_admin_magazine',[article]);const summaries=await call(null,'magazine_summaries');assert.equal(summaries[0].title,article.title);assert.ok(!JSON.stringify(summaries).includes(article.paragraphs[0]));await assert.rejects(()=>call(null,'magazine_open',[article.id]),/permission denied/);assert.equal((await call(member,'magazine_open',[article.id])).paragraphs[0],article.paragraphs[0]);await call(admin,'site_admin_magazine_remove',[article.id]);assert.deepEqual(await call(null,'magazine_summaries'),[]);
});

test('member activity aggregates stay admin-only and include hidden/deleted content and resolved reports',async()=>{
 await db.exec(readFileSync(new URL('202611160011_member_activity.sql',path),'utf8'));
 await assert.rejects(()=>call(member,'site_admin_members'),/GGO_ADMIN_REQUIRED/);
 await assert.rejects(()=>call(null,'site_admin_members'),/permission denied/);
 const rows=await call(admin,'site_admin_members');const row=rows.find(r=>r.id===member);
 const expected=await db.query(`select (select count(*)::int from public.posts where user_id=$1) posts,(select count(*)::int from public.comments where user_id=$1)+(select count(*)::int from public.poll_comments where user_id=$1) comments,(select count(*)::int from public.poll_ballots where user_id=$1) polls`,[member]);
 assert.equal(row.post_count,expected.rows[0].posts);assert.equal(row.comment_count,expected.rows[0].comments);assert.equal(row.poll_count,expected.rows[0].polls);assert.equal(row.received_report_count,0);
 await db.query("insert into ggo_private.reports(reporter_id,target_kind,target_id,reason,action) values($1,'post',$2,'신고 테스트','dismissed')",[admin,first]);
 await call(admin,'site_admin_post_action',[first,'delete',null]);
 const updated=(await call(admin,'site_admin_members')).find(r=>r.id===member);assert.equal(updated.post_count,row.post_count);assert.equal(updated.received_report_count,1);
});
