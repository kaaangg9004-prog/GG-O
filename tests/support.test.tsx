import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {demoSupportGateway,SUPPORT_STORAGE_KEY} from '../src/lib/support-demo';
import {serverSupportGateway} from '../src/lib/support-service';
import type {SupportMember} from '../src/lib/support-types';
import {SupportBoard} from '../src/components/support';
import Experience from '../src/components/experience';

const memberA:SupportMember={id:'demo:member-A',handle:'AAAA',joinedAt:'2026-11-14T00:00:00Z',demo:true,orders:[{id:'테스트-ORDER',status:'demo',subtotal:95000,createdAt:'2026-11-14T01:00:00Z',items:[{productId:'ggo-keyring',productName:'네온 키링 테스트 구매',variant:'green',variantLabel:'그린',quantity:1,unitPrice:95000}]}]};
const draft={title:'배송 일정 문의',category:'주문·배송' as const,body:'문의 본문에는 암호화할 고유한 테스트 내용을 적습니다.',password:'secret123'};
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});

test('demo support encrypts content, requires both ownership and the correct password, and allows operator review and replies',async()=>{
  let member=memberA;const gateway=demoSupportGateway(()=>member),id=await gateway.create(draft);
  const raw=localStorage.getItem(SUPPORT_STORAGE_KEY)!;assert.ok(!raw.includes(draft.body));assert.ok(!raw.includes(draft.password));assert.ok(!raw.includes('네온 키링 테스트 구매'));
  await assert.rejects(()=>gateway.open(id,'incorrect',false),/비밀번호가 일치/);
  assert.equal((await gateway.open(id,draft.password,false)).body,draft.body);
  await assert.rejects(()=>gateway.reply(id,'일반 회원 답변',false),/운영자만/);
  await assert.rejects(()=>gateway.list(true),/운영자만/);await assert.rejects(()=>gateway.open(id,'',true),/운영자만/);await assert.rejects(()=>gateway.reply(id,'일반 회원 우회 답변',true),/운영자만/);
  member={...memberA,id:'demo:member-B',handle:'BBBB',orders:[]};
  assert.deepEqual(await gateway.list(false),[]);await assert.rejects(()=>gateway.open(id,draft.password,false),/본인이 작성/);
  await assert.rejects(()=>gateway.member(memberA.id,id,false),/본인이 작성/);
  assert.equal((await gateway.list(true)).length,1);assert.equal((await gateway.open(id,'',true)).body,draft.body);
  assert.equal((await gateway.member(memberA.id,id,true)).orders[0].items[0].productName,'네온 키링 테스트 구매');
  await gateway.reply(id,'확인 후 안내드립니다. 테스트 답변입니다.',true);
  member=memberA;const restored=demoSupportGateway(()=>member);
  const opened=await restored.open(id,draft.password,false);assert.equal(opened.ticket.status,'answered');assert.equal(opened.replies.length,1);
  assert.equal(opened.replies[0].authorId,'GG-O 운영자');
});

test('a real support account cannot fall back to local inquiries or acquire a role from client flags',async()=>{
  await demoSupportGateway(()=>memberA).create(draft);
  const server=serverSupportGateway();await assert.rejects(()=>server.list(true),/서버가 아직 연결/);await assert.rejects(()=>server.open('any-id','',true),/서버가 아직 연결/);
  const ui=render(<SupportBoard isDemoAccount={false} member={()=>({...memberA,demo:false})}/>);
  await waitFor(()=>assert.ok(ui.getByRole('alert').textContent?.includes('서버가 아직 연결')));
  assert.equal(ui.queryByRole('button',{name:'운영자 화면 체험'}),null);assert.equal(ui.queryByRole('button',{name:'배송 일정 문의'}),null);
});

test('support form, password gate, member details and operator replies work through the interface',async()=>{
  let ui=render(<SupportBoard isDemoAccount member={()=>memberA}/>);
  await waitFor(()=>assert.ok(ui.queryByText('문의를 불러오고 있어요.')===null));
  fireEvent.click(ui.getAllByRole('button',{name:'문의 작성'})[0]);
  const compose=within(ui.getByRole('dialog',{name:'고객지원 문의 작성'}));
  fireEvent.change(compose.getByLabelText('문의 제목'),{target:{value:'주문 관련 테스트 문의'}});
  fireEvent.change(compose.getByLabelText('문의 내용'),{target:{value:draft.body}});
  fireEvent.change(compose.getByLabelText('글 비밀번호',{exact:true}),{target:{value:draft.password}});
  fireEvent.change(compose.getByLabelText('글 비밀번호 확인'),{target:{value:'different'}});
  fireEvent.click(compose.getByRole('button',{name:'문의 등록'}));assert.match(compose.getByRole('alert').textContent??'',/확인이 일치/);
  fireEvent.change(compose.getByLabelText('글 비밀번호 확인'),{target:{value:draft.password}});fireEvent.click(compose.getByRole('button',{name:'문의 등록'}));
  await waitFor(()=>assert.ok(ui.queryByRole('dialog')===null),{timeout:3000});
  await waitFor(()=>assert.ok(ui.getByRole('button',{name:'주문 관련 테스트 문의'})));
  fireEvent.click(ui.getByRole('button',{name:'주문 관련 테스트 문의'}));assert.equal(ui.queryByText(draft.body),null);
  fireEvent.change(ui.getByLabelText('글 비밀번호'),{target:{value:'incorrect'}});fireEvent.click(ui.getByRole('button',{name:'문의 확인'}));
  await waitFor(()=>assert.match(ui.getByRole('alert').textContent??'',/비밀번호가 일치/));
  fireEvent.change(ui.getByLabelText('글 비밀번호'),{target:{value:draft.password}});fireEvent.click(ui.getByRole('button',{name:'문의 확인'}));
  await waitFor(()=>assert.ok(ui.getByText(draft.body)));assert.equal(ui.queryByLabelText('운영자 답변 작성'),null);
  fireEvent.click(within(ui.getByRole('dialog')).getByRole('button',{name:'AAAA 회원 정보'}));
  await waitFor(()=>assert.ok(ui.getByText('테스트 이용 시작일')));assert.ok(ui.getByText('네온 키링 테스트 구매 · 그린 · 1개'));
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));cleanup();
  ui=render(<SupportBoard isDemoAccount member={()=>({...memberA,id:'demo:member-B',handle:'BBBB',orders:[]})}/>);
  await waitFor(()=>assert.ok(ui.getByRole('button',{name:'주문 관련 테스트 문의'})));
  assert.equal(ui.queryByRole('button',{name:'운영자 화면 체험'}),null);
  await waitFor(()=>assert.ok(ui.getByText('전체 문의',{exact:true})));
  fireEvent.click(ui.getByRole('button',{name:'주문 관련 테스트 문의'}));
  await waitFor(()=>assert.ok(ui.getByText(draft.body)));assert.equal(ui.queryByLabelText('글 비밀번호'),null);
  fireEvent.change(ui.getByLabelText('운영자 답변 작성'),{target:{value:'운영자가 남긴 테스트 답변입니다.'}});fireEvent.click(ui.getByRole('button',{name:'답변 등록'}));
  await waitFor(()=>assert.ok(within(ui.getByRole('region',{name:'운영자 답변'})).getByText('운영자가 남긴 테스트 답변입니다.')));assert.ok(within(ui.getByRole('dialog')).getByText('답변 완료'));
});

test('the header customer support button navigates directly to support without changing the five dock entries',async()=>{
  const ui=render(<Experience authenticated/>);
  fireEvent.click(ui.getAllByRole('button',{name:'고객지원'}).find(button=>button.classList.contains('support-trigger'))!);
  await waitFor(()=>assert.ok(ui.getByRole('heading',{level:1,name:'고객지원.'})));
  assert.equal(window.location.hash,'#support');assert.ok(ui.getByText(/고객지원 체험/));
  assert.deepEqual(within(ui.getByRole('navigation',{name:'모바일 주 메뉴'})).getAllByRole('button').map(b=>b.textContent),['홈','소식','커뮤니티','투표','이벤트']);
});
