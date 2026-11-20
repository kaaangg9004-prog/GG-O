import test from 'node:test';
import assert from 'node:assert/strict';
import {events} from '../src/lib/data';
import {listedEvents,parseEvent,removeEvent,saveEvent,EVENT_PLACEHOLDER} from '../src/lib/event-catalog';
import {reactToEvent} from '../src/lib/event-reactions';
import {readState} from '../src/lib/store';

const custom={...events[0],id:'event-custom',title:'새 이벤트',label:'문화 산책',description:'하노이에서 함께 걷는 모임입니다.',location:'하노이 호안끼엠',schedule:'12월 7일 오후 2시',image:EVENT_PLACEHOLDER,status:'모집 중' as const};

test('event creation and editing survive reload with cover, schedule, stable ID and reactions intact',()=>{
  const initial=readState(null);let state=saveEvent(initial,custom);state=reactToEvent(state,custom.id,'like');state=reactToEvent(state,events[0].id,'dislike');
  state=readState(JSON.stringify(state));assert.deepEqual(listedEvents(state)[0],custom);assert.equal(listedEvents(state).length,events.length+1);
  state=saveEvent(state,{...custom,title:'수정한 이벤트',description:'새로운 소개문입니다.',image:'/images/concert.jpg',status:'종료'});
  state=saveEvent(state,{...events[0],title:'수정한 기본 이벤트',schedule:'일정 추후 안내'});state=readState(JSON.stringify(state));
  assert.equal(listedEvents(state).find(event=>event.id===custom.id)?.image,'/images/concert.jpg');assert.equal(listedEvents(state).find(event=>event.id===events[0].id)?.title,'수정한 기본 이벤트');
  assert.equal(state.eventReactions[custom.id],'like');assert.equal(state.eventReactions[events[0].id],'dislike');assert.deepEqual(initial.eventEdits,[]);assert.equal(events[0].title,'하노이에서, 같이 가자!');
});

test('deleting original and custom events persists and clears only their reactions',()=>{
  let state=saveEvent(readState(null),custom);state=reactToEvent(state,events[0].id,'like');state=reactToEvent(state,events[1].id,'dislike');state=reactToEvent(state,custom.id,'like');state.favorites=['ggo-tote'];
  state=readState(JSON.stringify(removeEvent(removeEvent(state,custom.id),events[0].id)));
  assert.deepEqual(listedEvents(state).map(event=>event.id),[events[1].id]);assert.deepEqual(state.eventReactions,{[events[1].id]:'dislike'});assert.deepEqual(state.eventInterests,[]);assert.deepEqual(state.eventEdits,[]);assert.deepEqual(state.favorites,['ggo-tote']);
  assert.equal(reactToEvent(state,custom.id,'like'),state);assert.equal(removeEvent(state,'missing-event'),state);
});

test('older saved shopping data migrates with both default events and earlier event interests',()=>{
  const state=readState(JSON.stringify({schema:2,deviceKey:'existing-device',eventInterests:[events[0].id],favorites:['ggo-tote'],cart:[{productId:'ggo-tote',variant:'black-white',quantity:2}]}));
  assert.equal(state.deviceKey,'existing-device');assert.equal(state.cart[0].quantity,2);assert.deepEqual(state.favorites,['ggo-tote']);assert.deepEqual(listedEvents(state),events);assert.equal(state.eventReactions[events[0].id],'like');assert.deepEqual(state.eventEdits,[]);assert.deepEqual(state.deletedEventIds,[]);
});

test('malformed event storage cannot invalidate unrelated data or restore deleted reactions',()=>{
  for(const patch of [{title:' '},{location:''},{status:'unknown'},{id:'../bad'},{schedule:'x'.repeat(201)},{image:'javascript:alert(1)'},{image:'/images/../../private'},{description:'x'.repeat(3001)}])assert.equal(parseEvent({...custom,...patch}),null);
  assert.throws(()=>saveEvent(readState(null),{...custom,title:''}),/이벤트 제목/);
  const state=readState(JSON.stringify({schema:2,favorites:['ggo-tote'],eventEdits:[{...custom,image:'https://not-bundled.example/image.svg'},custom,{...custom,title:'중복 ID'}],deletedEventIds:[events[0].id,'../invalid'],eventReactions:{[events[0].id]:'like',[custom.id]:'dislike',missing:'like'}}));
  assert.deepEqual(state.favorites,['ggo-tote']);assert.equal(state.eventEdits.length,1);assert.equal(state.eventEdits[0].title,custom.title);assert.deepEqual(state.eventReactions,{[custom.id]:'dislike'});assert.deepEqual(state.deletedEventIds,[events[0].id]);
});
