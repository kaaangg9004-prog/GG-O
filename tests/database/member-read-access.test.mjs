import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const db=new PGlite({extensions:{pgcrypto}}),member='b0000000-0000-4000-8000-000000000001',other='b0000000-0000-4000-8000-000000000002';
const directory=new URL('../../supabase/migrations/',import.meta.url),migration='202611160010_member_read_access.sql';
const secret='MEMBER_ONLY_BODY_7b2cf',opinion='MEMBER_ONLY_COMMENT_2b37c',pollSecret='MEMBER_ONLY_POLL_85e1b';let post;
async function as(role,user,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;}
const call=(user,name,args=[])=>as(user?'authenticated':'anon',user,()=>rpc(name,args));
const write=(actor,action,data)=>as('service_role',null,()=>rpc('anonymous_trusted_write',[actor,'203.0.113.61',action,data]));
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}',raw_user_meta_data jsonb not null default '{}');
 create table auth.identities(user_id uuid references auth.users(id),provider text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,directory),'utf8'));
 for(const id of [member,other]){await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{\"provider\":\"google\"}')",[id,id+'@example.test']);await db.query("insert into auth.identities values($1,'google')",[id]);}
 post=(await write(member,'post.create',{title:'목록에서 볼 수 있는 제목',body:secret,topic:'자유'})).id;
 await write(other,'comment.create',{post_id:post,body:opinion});await db.query("update public.posts set view_count=300,image_path='https://example.test/member-only.webp' where id=$1",[post]);
 const document={id:'locked-poll',title:'공개 투표 제목',image:'/images/tote.jpg',active:true,summary:pollSecret,blocks:[{id:'block',type:'text',text:pollSecret}],questions:[{id:'question',prompt:'선택하세요',options:[{id:'a',label:'하나'},{id:'b',label:'둘'}]}]};
 await db.query("insert into public.polls(id,document) values('locked-poll',$1)",[document]);
 await db.query("insert into public.poll_ballots(poll_id,user_id,answers,revision) values('locked-poll',$1,'{\"question\":\"a\"}',1)",[other]);
 await write(other,'poll_comment.create',{poll_id:'locked-poll',body:opinion});
});
after(()=>db.close());
test('guests browse ordinary/TOP/legacy lists without bodies or attachment URLs and cannot search private body text',async()=>{
 for(const [name,args] of [['anonymous_posts',[]],['anonymous_feed',['전체']],['anonymous_feed',['hot']],['anonymous_feed',['자유']]]){
  const rows=await call(null,name,args);assert.equal(rows.length,1);assert.equal(rows[0].id,post);assert.equal(rows[0].body,'');assert.equal(rows[0].image_path,'');assert.ok(!JSON.stringify(rows).includes(secret));assert.ok(!JSON.stringify(rows).includes(opinion));assert.ok(!JSON.stringify(rows).includes(member));assert.ok(!JSON.stringify(rows).includes('203.0.113.61'));
 }
 assert.deepEqual(await call(null,'anonymous_feed',['전체',30,null,null,secret]),[]);assert.equal((await call(member,'anonymous_feed',['전체',30,null,null,secret])).length,1);
});
test('direct unauthenticated post, post-comment, poll-comment and poll-detail RPC requests are refused',async()=>{
 for(const [name,args] of [['anonymous_post',[post]],['anonymous_comments',['post',post]],['anonymous_comments',['poll','locked-poll']],['poll_open',['locked-poll']]]){
  await assert.rejects(()=>call(null,name,args),/permission denied/);
  await assert.rejects(()=>as('authenticated',null,()=>rpc(name,args)),/GGO_AUTH_REQUIRED/);
 }
 for(const table of ['posts','comments','polls','poll_comments','poll_ballots'])await assert.rejects(()=>as('anon',null,()=>db.query('select * from public.'+table)),/permission denied/);
});
test('poll summary cards remain public and never contain question, body, comment or result data',async()=>{
 const rows=await call(null,'poll_summaries');assert.equal(rows[0].id,'locked-poll');assert.deepEqual(Object.keys(rows[0]).sort(),['id','image','title']);assert.ok(!JSON.stringify(rows).includes(pollSecret));assert.ok(!JSON.stringify(rows).includes(opinion));
});
test('authenticated members can read bodies/comments and private ballot results without exposing author identity',async()=>{
 const detail=await call(other,'anonymous_post',[post]);assert.equal(detail.body,secret);assert.equal(detail.is_mine,false);assert.ok(!JSON.stringify(detail).includes(member));
 const comments=await call(member,'anonymous_comments',['post',post]);assert.equal(comments[0].body,opinion);assert.equal(comments[0].author_label,'Ẩn danh 1');assert.equal(comments[0].is_mine,false);
 const poll=await call(member,'poll_open',['locked-poll']);assert.equal(poll.poll.summary,pollSecret);assert.equal(poll.comments[0].text,opinion);assert.equal(poll.results,null);
 const voted=await call(other,'poll_open',['locked-poll']);assert.equal(voted.participants,1);assert.ok(voted.results);assert.equal(voted.myVote.answers.question,'a');
 await db.query("update public.profiles set status='suspended',suspended_until=now()+interval '7 days' where id=$1",[member]);assert.equal((await call(member,'anonymous_post',[post])).body,secret);await assert.rejects(()=>write(member,'comment.create',{post_id:post,body:'제한 중 작성'}),/GGO_MEMBER_RESTRICTED/);
});
test('reapplying the read-access migration revokes legacy anonymous detail grants and preserves all posts/votes',async()=>{
 await db.exec('grant execute on function public.anonymous_post(uuid),public.anonymous_comments(text,text,integer,integer),public.poll_open(text) to anon');
 await db.exec(readFileSync(new URL(migration,directory),'utf8'));
 await assert.rejects(()=>call(null,'poll_open',['locked-poll']),/permission denied/);await assert.rejects(()=>call(null,'anonymous_post',[post]),/permission denied/);
 assert.equal((await call(member,'anonymous_post',[post])).body,secret);assert.equal((await call(other,'poll_open',['locked-poll'])).participants,1);
});
