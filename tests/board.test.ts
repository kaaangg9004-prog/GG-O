import test from 'node:test';
import assert from 'node:assert/strict';
import {readState} from '../src/lib/store';
import {seedPosts,products,productVariant} from '../src/lib/data';
import {addReport,publicPost,resolveReport,restoreReportedContent,visiblePosts,visibleComments,postReportCount,hasReported} from '../src/lib/board';

test('anonymous labels identify thread roles without exposing private ownership',()=>{
  const state=readState(null);
  const post={...structuredClone(seedPosts[0]),ownerKey:'secret-author',comments:[
    {id:'own-comment',ownerKey:'secret-author',text:'글쓴이가 쓴 댓글',createdAt:new Date().toISOString()},
    {id:'other-comment',ownerKey:'secret-other',text:'다른 사람의 댓글',createdAt:new Date().toISOString()},
  ]};
  const publicData=publicPost(post,state);
  assert.equal(publicData.author,'익명(글쓴이)');
  assert.deepEqual(publicData.comments.map(c=>c.author),['익명(글쓴이)','익명 1']);
  assert.ok(!JSON.stringify(publicData).includes('secret-'));
  assert.ok(!JSON.stringify(publicData).includes('ownerKey'));
  assert.deepEqual(Object.keys(publicData.comments[0]),Object.keys(publicData.comments[1]));
});
test('reporting, hiding a post and restoring it persist across a reload',()=>{
  let state=addReport(readState(null),{postId:'post-1'},'광고·도배','확인 부탁합니다.');
  assert.equal(state.reports[0].status,'pending');
  assert.throws(()=>addReport(state,{postId:'post-1'},'광고·도배',''),/이미 접수/);
  state=resolveReport(state,state.reports[0].id,'hidden');
  assert.ok(!visiblePosts(state).some(p=>p.id==='post-1'));
  state=readState(JSON.stringify(state));
  assert.equal(state.reports[0].status,'hidden');
  assert.ok(!visiblePosts(state).some(p=>p.id==='post-1'));
  state=restoreReportedContent(state,state.reports[0].id);
  assert.ok(visiblePosts(state).some(p=>p.id==='post-1'));
});
test('comment moderation hides only the target comment and dismissal keeps content visible',()=>{
  let state=addReport(readState(null),{postId:'post-1',commentId:'c-1'},'욕설·혐오·괴롭힘','');
  state=resolveReport(state,state.reports[0].id,'hidden');
  assert.equal(visibleComments(seedPosts[0],state).length,0);
  assert.ok(visiblePosts(state).some(p=>p.id==='post-1'));
  state=addReport(state,{postId:'post-2'},'기타','내용 확인');
  state=resolveReport(state,state.reports[0].id,'dismissed');
  assert.ok(visiblePosts(state).some(p=>p.id==='post-2'));
  assert.throws(()=>addReport(state,{postId:'post-1',commentId:'missing'},'기타',''),/찾을 수/);
});
test('legacy data migration preserves selected colors and removes public member identity and following',()=>{
  const old={schema:1,cart:[{productId:'ggo-tote',variant:'Đen / Trắng',quantity:2}],following:['old-handle'],posts:[{id:'local-old',userId:'local',author:'이름을 노출하면 안 됨',handle:'private.handle',avatar:'/old.png',caption:'예전에 작성한 글 내용',image:'',tags:[],likes:0,comments:[{id:'legacy-comment',author:'이름',text:'예전 댓글',createdAt:'2026-11-14T01:00:00Z'}],createdAt:'2026-11-14T00:00:00Z',topic:'Style'}]};
  const restored=readState(JSON.stringify(old));
  assert.equal(restored.schema,2);
  assert.equal(restored.cart[0].variant,'black-white');
  assert.equal(productVariant(products[0],restored.cart[0].variant).label,'블랙 / 화이트');
  assert.ok(!('following'in restored));assert.ok(!('author'in restored.posts[0]));
  assert.ok(!JSON.stringify(publicPost(restored.posts[0],restored)).includes('private.handle'));
});

test('one reporter can report each post only once even after dismissal or restoration',()=>{
  let state=addReport(readState(null),{postId:'post-1'},'기타','', 'member-A');
  state=resolveReport(state,state.reports[0].id,'dismissed');state=readState(JSON.stringify(state));
  assert.ok(hasReported(state,{postId:'post-1'},'member-A'));
  assert.throws(()=>addReport(state,{postId:'post-1'},'광고·도배','다른 사유','member-A'),/한 번만/);
  state=addReport(state,{postId:'post-1'},'기타','','member-B');
  assert.equal(postReportCount(state,'post-1'),2);
  assert.equal(postReportCount(addReport(state,{postId:'post-1',commentId:'c-1'},'기타','','member-A'),'post-1'),2);
});

test('the fiftieth distinct post reporter auto-hides the post while leaving pending operator review',()=>{
  let state=readState(null);
  for(let i=1;i<=49;i++)state=addReport(state,{postId:'post-1'},'기타','',`reporter-${i}`);
  assert.equal(postReportCount(state,'post-1'),49);assert.ok(visiblePosts(state).some(p=>p.id==='post-1'));
  assert.throws(()=>addReport(state,{postId:'post-1'},'기타','','reporter-1'),/한 번만/);
  state=addReport(state,{postId:'post-1'},'기타','','reporter-50');state=readState(JSON.stringify(state));
  assert.equal(postReportCount(state,'post-1'),50);assert.ok(!visiblePosts(state).some(p=>p.id==='post-1'));
  assert.ok(state.autoHiddenPosts.includes('post-1'));assert.equal(state.reports.filter(r=>r.status==='pending').length,50);
  state=resolveReport(state,state.reports[0].id,'dismissed');
  assert.ok(visiblePosts(state).some(p=>p.id==='post-1'));assert.ok(!state.autoHiddenPosts.includes('post-1'));
  assert.throws(()=>addReport(state,{postId:'post-1'},'기타','','reporter-1'),/한 번만/);
  state=addReport(state,{postId:'post-1'},'기타','','reporter-51');
  assert.ok(visiblePosts(state).some(p=>p.id==='post-1'),'explicit operator restoration is preserved');
});
