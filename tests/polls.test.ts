import test from 'node:test';
import assert from 'node:assert/strict';
import {addPollComment,castPollVote,listedPolls,openLocalPoll,parsePoll,removePoll,savePoll,seedPolls} from '../src/lib/polls';
import {readState} from '../src/lib/store';
const admin={id:'operator',isAdmin:true},member={id:'member-1',isAdmin:false},other={id:'member-2',isAdmin:false},guest={id:null,isAdmin:false};
const poll=seedPolls[0],answers=Object.fromEntries(poll.questions.map(q=>[q.id,q.options[0].id]));

test('only an authenticated operator can create, edit or delete a poll',()=>{
  const state=readState(null);for(const actor of [member,guest]){assert.throws(()=>savePoll(state,poll,actor));assert.throws(()=>removePoll(state,poll.id,actor));}
  const saved=savePoll(state,{...poll,id:'custom-poll',title:'직접 등록한 투표'},admin);assert.equal(listedPolls(saved)[0].title,'직접 등록한 투표');assert.equal(state.pollEdits.length,0);
});

test('every question requires exactly one known choice; invalid or partial ballots do not mutate state',()=>{
  const state=readState(null);for(const choices of [{},Object.fromEntries(Object.entries(answers).slice(1)),{...answers,color:['ecru-black','black-white']},{...answers,color:'missing'},{...answers,extra:'value'}])assert.throws(()=>castPollVote(state,poll.id,poll.revision,choices,member),/모든 항목/);
  assert.throws(()=>castPollVote(state,poll.id,poll.revision,answers,guest),/로그인/);assert.throws(()=>castPollVote(state,poll.id,999,answers,member),/변경/);assert.equal(state.pollBallots.length,0);
});

test('a single submission counts every question once, survives reload and cannot be replaced by a second submission',()=>{
  let state=castPollVote(readState(null),poll.id,poll.revision,answers,member);state=readState(JSON.stringify(state));
  const opened=openLocalPoll(state,poll.id,member);assert.equal(opened.participants,1);assert.deepEqual(opened.myVote?.answers,answers);for(const result of opened.results!)assert.equal(result.options.reduce((sum,item)=>sum+item.count,0),1);
  assert.throws(()=>castPollVote(state,poll.id,poll.revision,{...answers,color:poll.questions[0].options[1].id},member),/이미 참여/);assert.equal(state.pollBallots.length,1);
});

test('nonparticipants cannot see tallies or comment, while participant comments expose no author identity',()=>{
  let state=castPollVote(readState(null),poll.id,poll.revision,answers,member);
  const nonparticipant=openLocalPoll(state,poll.id,other);assert.equal(nonparticipant.myVote,null);assert.equal(nonparticipant.results,null);assert.equal(nonparticipant.participants,null);
  assert.equal(openLocalPoll(state,poll.id,guest).myVote,null);assert.throws(()=>addPollComment(state,poll.id,'아직 참여하지 않았습니다.',other),/참여/);
  state=addPollComment(state,poll.id,'직접 작성한 익명 의견',member);const opened=openLocalPoll(state,poll.id,member);assert.deepEqual(Object.keys(opened.comments[0]).sort(),['author_label','createdAt','id','is_mine','text']);assert.equal(opened.comments[0].text,'직접 작성한 익명 의견');
});

test('editing voted polls preserves votes and content, while question or choice changes are rejected',()=>{
  let state=castPollVote(readState(null),poll.id,poll.revision,answers,member);
  assert.throws(()=>savePoll(state,{...poll,questions:poll.questions.slice(0,2)},admin),/참여자가/);
  state=savePoll(state,{...poll,title:'편집한 제목',blocks:[{id:'detail-heading',type:'heading',text:'새 상세 제목'},{id:'detail-image',type:'image',image:'/images/tote-black.svg',caption:'큰 사진'}]},admin);
  state=readState(JSON.stringify(state));const opened=openLocalPoll(state,poll.id,member);assert.equal(opened.poll.title,'편집한 제목');assert.equal(opened.participants,1);assert.equal(opened.poll.blocks.length,2);assert.equal(opened.poll.revision,2);
});

test('poll definitions enforce three questions, five choices and valid detail blocks',()=>{
  assert.ok(parsePoll(poll));for(const patch of [{questions:[]},{questions:[...poll.questions,poll.questions[0]]},{questions:[{...poll.questions[0],options:[...poll.questions[0].options,...Array.from({length:5},(_,i)=>({id:'new-'+i,label:'보기 '+i}))]}]},{questions:[{...poll.questions[0],options:[poll.questions[0].options[0],poll.questions[0].options[0]]}]},{image:'javascript:alert(1)'},{blocks:[{id:'text',type:'script',text:'bad'}]}])assert.equal(parsePoll({...poll,...patch}),null);
});

test('deleting a poll removes its ballots and comments without deleting archived store or community data',()=>{
  let state=addPollComment(castPollVote(readState(null),poll.id,1,answers,member),poll.id,'익명 댓글입니다.',member);state.favorites=['ggo-tote'];state=readState(JSON.stringify(removePoll(state,poll.id,admin)));
  assert.ok(!listedPolls(state).some(item=>item.id===poll.id));assert.deepEqual(state.pollBallots,[]);assert.deepEqual(state.pollComments,[]);assert.deepEqual(state.favorites,['ggo-tote']);
});

test('legacy storage restores clean poll defaults and corrupt duplicate ballots cannot inflate results',()=>{
  const old=readState(JSON.stringify({schema:2,eventInterests:['hanoi-meetup'],favorites:['ggo-tote']}));assert.equal(listedPolls(old).length,3);assert.deepEqual(old.favorites,['ggo-tote']);
  const valid=castPollVote(old,poll.id,1,answers,member);const vote=valid.pollBallots[0];const restored=readState(JSON.stringify({...valid,pollBallots:[vote,vote,{...vote,userKey:'invalid',answers:{}}],pollComments:[{id:'orphan',pollId:poll.id,userKey:'invalid',text:'bad',createdAt:new Date().toISOString()}]}));assert.equal(openLocalPoll(restored,poll.id,member).participants,1);assert.deepEqual(restored.pollComments,[]);
});
