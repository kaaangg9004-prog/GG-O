import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const ids={author:'10000000-0000-0000-0000-000000000001',one:'10000000-0000-0000-0000-000000000002',two:'10000000-0000-0000-0000-000000000003',admin:'10000000-0000-0000-0000-000000000004',facebook:'10000000-0000-0000-0000-000000000005'};
const ip='203.0.113.41';let post,second,c1,c2,c3,report;
async function as(role,user,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}}
async function rpc(name,args=[]){const result=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);return result.rows[0].value;}
const write=(actor,action,data)=>as('service_role',null,()=>rpc('anonymous_trusted_write',[actor,ip,action,data]));
const read=(user,name,args=[])=>as(user?'authenticated':'anon',user,()=>rpc(name,args));
const fails=async(fn,regex)=>assert.rejects(fn,regex);
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb not null default '{}'); create table auth.identities(user_id uuid references auth.users(id),provider text); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role;`);
 await db.exec(readFileSync(new URL('../../supabase/migrations/202611160008_member_anonymity.sql',import.meta.url),'utf8'));
 for(const [name,id] of Object.entries(ids)){const provider=name==='facebook'?'facebook':'google';await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,name+'@example.test',{provider}]);await db.query('insert into auth.identities(user_id,provider) values($1,$2)',[id,provider]);}
 await db.query("update public.profiles set role='admin' where id=$1",[ids.admin]);
 post=(await write(ids.author,'post.create',{title:'회원 익명 게시글',body:'게스트도 읽을 수 있는 본문',topic:'자유'})).id;
 second=(await write(ids.author,'post.create',{title:'두 번째 게시글',body:'번호는 게시글마다 새로 시작합니다',topic:'정보'})).id;
});
after(()=>db.close());
test('guest reads contain only safe fields; raw table, private mapping and trusted RPC access are denied',async()=>{
 const rows=await read(null,'anonymous_posts');assert.equal(rows.length,2);assert.equal(rows[0].is_mine,false);assert.equal(rows[0].author_label,'Ẩn danh (Tác giả)');
 for(const field of ['user_id','ip_address','ownerKey','email'])assert.equal(JSON.stringify(rows).includes(field),false);
 assert.equal(JSON.stringify(rows).includes(ids.author),false);assert.equal(JSON.stringify(rows).includes(ip),false);
 for(const role of ['anon','authenticated'])for(const sql of ['select * from public.posts','select user_id,ip_address from public.comments','select id,title from public.posts','select * from public.poll_comments','select * from ggo_private.author_numbers'])await fails(()=>as(role,ids.one,()=>db.query(sql)),/permission denied/);
 await fails(()=>as('authenticated',ids.one,()=>rpc('anonymous_trusted_write',[ids.one,ip,'post.create',{title:'우회',body:'작성 시도'}])),/permission denied/);
 assert.equal((await read(ids.author,'anonymous_post',[post])).is_mine,true);assert.equal((await read(ids.one,'anonymous_post',[post])).is_mine,false);
});
test('profile privilege escalation and non-Google writes fail; suspended expiration is enforced by DB',async()=>{
 await fails(()=>as('authenticated',ids.one,()=>db.query("update public.profiles set role='admin' where id=$1",[ids.one])),/permission denied/);
 await fails(()=>write(ids.facebook,'comment.create',{post_id:post,body:'작성 금지'}),/GGO_MEMBER_RESTRICTED/);
 await db.query("update public.profiles set status='suspended',suspended_until=now()+interval '7 days' where id=$1",[ids.one]);
 assert.equal((await read(ids.one,'anonymous_access')).can_write,false);
 await fails(()=>write(ids.one,'comment.create',{post_id:post,body:'정지 중 작성'}),/GGO_MEMBER_RESTRICTED/);
 await db.query("update public.profiles set suspended_until=now()-interval '1 second' where id=$1",[ids.one]);assert.equal((await read(ids.one,'anonymous_access')).can_write,true);
 await db.query("update public.profiles set status='active',suspended_until=null where id=$1",[ids.one]);
});
test('author labels, stable per-thread numbers, replies and deletion never expose or renumber identity',async()=>{
 c1=(await write(ids.one,'comment.create',{post_id:post,body:'첫 번째 회원 댓글'})).id;
 c2=(await write(ids.two,'comment.create',{post_id:post,body:'두 번째 회원 댓글',parent_id:c1})).id;
 c3=(await write(ids.one,'comment.create',{post_id:post,body:'같은 회원의 답글',parent_id:c2})).id;
 await write(ids.author,'comment.create',{post_id:post,body:'글쓴이 댓글'});
 await write(ids.two,'comment.create',{post_id:second,body:'다른 게시글 첫 댓글'});
 const comments=await read(ids.one,'anonymous_comments',['post',post]);assert.deepEqual(comments.map(c=>c.author_label),['Ẩn danh 1','Ẩn danh 2','Ẩn danh 1','Ẩn danh (Tác giả)']);assert.deepEqual(comments.map(c=>c.is_mine),[true,false,true,false]);assert.equal(comments[1].parent_id,c1);
 assert.equal((await read(null,'anonymous_comments',['post',second]))[0].author_label,'Ẩn danh 1');
 await write(ids.one,'comment.delete',{id:c1});const remaining=await read(null,'anonymous_comments',['post',post]);assert.deepEqual(remaining.map(c=>c.author_label),['Ẩn danh 2','Ẩn danh 1','Ẩn danh (Tác giả)']);
 assert.ok(!JSON.stringify(remaining).includes(ip));assert.ok(!JSON.stringify(remaining).includes(ids.one));
});
test('edits/deletes require ownership, invalid parents fail and client identity/IP injection is rejected',async()=>{
 await fails(()=>write(ids.two,'comment.update',{id:c3,body:'다른 사람 수정'}),/GGO_NOT_FOUND/);
 await fails(()=>write(ids.two,'post.delete',{id:post}),/GGO_NOT_FOUND/);
 await fails(()=>write(ids.one,'comment.create',{post_id:second,parent_id:c2,body:'다른 게시글 답글'}),/GGO_INVALID_INPUT/);
 await fails(()=>write(ids.one,'post.create',{title:'위조',body:'작성 시도',user_id:ids.author,ip_address:'1.1.1.1'}),/GGO_INVALID_INPUT/);
 await write(ids.one,'comment.update',{id:c3,body:'본인 댓글 수정'});assert.equal((await read(ids.one,'anonymous_comments',['post',post])).find(c=>c.id===c3).body,'본인 댓글 수정');
 await write(ids.author,'post.update',{id:second,title:'수정된 게시글',body:'본인이 수정한 내용',topic:'자유'});assert.equal((await read(null,'anonymous_post',[second])).title,'수정된 게시글');
});
test('report identities are admin-only; sanctions, deletion and audited reads/actions are server enforced',async()=>{
 await read(ids.two,'anonymous_report',['comment',c3,'신고 내용 테스트']);
 await fails(()=>read(ids.two,'anonymous_report',['comment',c3,'중복 신고 사유']),/GGO_ALREADY_REPORTED/);
 await fails(()=>read(ids.one,'anonymous_admin_reports'),/GGO_ADMIN_REQUIRED/);await fails(()=>read(null,'anonymous_admin_reports'),/permission denied/);
 const queue=await read(ids.admin,'anonymous_admin_reports');report=queue[0].id;assert.equal(queue[0].user_id,ids.one);assert.equal(queue[0].email,'one@example.test');assert.equal(queue[0].ip_address,ip);
 await fails(()=>read(ids.two,'anonymous_admin_action',[report,'ban',true]),/GGO_ADMIN_REQUIRED/);
 await read(ids.admin,'anonymous_admin_action',[report,'suspend_7d',true]);await read(ids.admin,'anonymous_admin_action',[report,'suspend_7d',true]);
 const member=(await db.query('select status,suspended_until from public.profiles where id=$1',[ids.one])).rows[0];assert.equal(member.status,'suspended');assert.ok(new Date(member.suspended_until)>new Date(Date.now()+6.9*86400000));
 await fails(()=>write(ids.one,'comment.create',{post_id:post,body:'제재 우회'}),/GGO_MEMBER_RESTRICTED/);await fails(()=>write(ids.one,'post.update',{id:second,title:'수정',body:'정지 중 수정'}),/GGO_MEMBER_RESTRICTED/);
 assert.equal((await read(null,'anonymous_comments',['post',post])).some(c=>c.id===c3),false);
 assert.equal((await db.query("select count(*)::int count from ggo_private.audit_log where action='admin.suspend_7d'")).rows[0].count,1);
 await db.query("update public.profiles set suspended_until=now()-interval '1 second' where id=$1",[ids.one]);assert.equal((await read(ids.one,'anonymous_access')).can_write,true);
 await read(ids.author,'anonymous_report',['comment',c2,'차단 처리 테스트']);const ban=(await read(ids.admin,'anonymous_admin_reports')).find(r=>r.target_id===c2);
 await read(ids.admin,'anonymous_admin_action',[ban.id,'ban',false]);assert.equal((await read(ids.two,'anonymous_access')).can_write,false);await fails(()=>write(ids.two,'comment.delete',{id:c2}),/GGO_MEMBER_RESTRICTED/);
});
test('fifty distinct reports hide a post atomically and one member cannot count twice',async()=>{
 const target=(await write(ids.author,'post.create',{title:'신고 누적 테스트',body:'서로 다른 회원의 신고 누적',topic:'자유'})).id;
 for(let i=1;i<=50;i++){const id='20000000-0000-0000-0000-'+String(i).padStart(12,'0');await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{\"provider\":\"google\"}')",[id,'reporter'+i+'@example.test']);await db.query("insert into auth.identities(user_id,provider) values($1,'google')",[id]);await read(id,'anonymous_report',['post',target,'내용 확인 부탁']);if(i===49)assert.equal((await read(null,'anonymous_post',[target])).id,target);}
 await fails(()=>read(null,'anonymous_post',[target]),/GGO_NOT_FOUND/);assert.equal((await db.query('select report_count from public.posts where id=$1',[target])).rows[0].report_count,50);
});
test('poll anonymous comments use the same guarded system, require participation, and are guest readable',async()=>{
 await db.query("insert into public.polls(id,document) values('photo-poll',$1)",[{id:'photo-poll',title:'투표',questions:[]}]);
 await fails(()=>write(ids.author,'poll_comment.create',{poll_id:'photo-poll',body:'미참여 댓글'}),/GGO_VOTE_REQUIRED/);
 await db.query("insert into public.poll_ballots(poll_id,user_id,answers,revision) values('photo-poll',$1,'{}',1)",[ids.author]);
 await write(ids.author,'poll_comment.create',{poll_id:'photo-poll',body:'투표 참가자 의견'});
 const comments=await read(null,'anonymous_comments',['poll','photo-poll']);assert.equal(comments[0].author_label,'Ẩn danh 1');assert.equal(comments[0].is_mine,false);
 const poll=await read(null,'poll_open',['photo-poll']);assert.equal(poll.myVote,null);assert.equal(poll.results,null);assert.equal(poll.comments[0].author_label,'Ẩn danh 1');assert.ok(!JSON.stringify(poll).includes(ids.author));
});
test('reapplying the migration preserves numbers and revokes legacy column grants again',async()=>{
 await db.exec('grant select(id,title,user_id,ip_address) on public.posts to anon');
 await db.exec(readFileSync(new URL('../../supabase/migrations/202611160008_member_anonymity.sql',import.meta.url),'utf8'));
 await fails(()=>as('anon',null,()=>db.query('select user_id,ip_address from public.posts')),/permission denied/);
 const comments=await read(null,'anonymous_comments',['post',post]);assert.equal(comments.find(c=>c.id===c2).author_label,'Ẩn danh 2');
});
