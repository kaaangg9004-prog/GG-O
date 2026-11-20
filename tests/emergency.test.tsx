import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {EmergencyAdmin,EmergencyPage} from '../src/components/emergency';
import {HomeHero} from '../src/components/home-hero';
import Experience from '../src/components/experience';
import {emergencyGateway} from '../src/lib/emergency-service';
import type {EmergencyTransport} from '../src/lib/emergency-service';
import {EMERGENCY_CONSENT_VERSION} from '../src/lib/emergency';
import type {EmergencyDraft,EmergencyGateway,EmergencyRecord} from '../src/lib/emergency';

const requestId='11111111-1111-4111-8111-111111111111',receiptId='22222222-2222-4222-8222-222222222222';
const draft:EmergencyDraft={name:'테스트 요청자',phone:'+82 10 0000 0000',email:'preview@example.com',location:'서울역 1번 출구 (테스트)',body:'화면과 접수 흐름을 확인하는 테스트 요청입니다.',consent:true,consentVersion:EMERGENCY_CONSENT_VERSION};
const access={enabled:true,isAdmin:false,consentVersion:EMERGENCY_CONSENT_VERSION};
const record:EmergencyRecord={...draft,id:receiptId,status:'new',createdAt:'2026-11-14T02:00:00Z',consentedAt:'2026-11-14T02:00:00Z',expiresAt:'2027-02-12T02:00:00Z'};
function fakeGateway(patch:Partial<EmergencyGateway>={}):EmergencyGateway {
  return {access:async()=>access,submit:async()=>({id:receiptId}),list:async()=>[],open:async()=>record,resolve:async()=>{},...patch};
}
function fill(ui:ReturnType<typeof render>) {
  for(const [label,value] of [['이름',draft.name],['연락처',draft.phone],['메일주소',draft.email],['현위치',draft.location],['요청 내용',draft.body]])fireEvent.change(ui.getByLabelText(label),{target:{value}});
}
function storedValues(){return [...Object.keys(localStorage).map(k=>localStorage.getItem(k)),...Object.keys(sessionStorage).map(k=>sessionStorage.getItem(k))].join('');}
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});

test('inactive intake rejects before sending personal fields; consent and real authentication are required',async()=>{
  const calls:{name:string;args?:Record<string,unknown>}[]=[];
  const connection:EmergencyTransport={user:async()=>({id:'real-user'}),call:async(name,args)=>{calls.push({name,args});return {data:{...access,enabled:false},error:null};}};
  const gateway=emergencyGateway(connection);
  await assert.rejects(()=>gateway.submit({...draft,consent:false},requestId),/동의/);assert.equal(calls.length,0);
  await assert.rejects(()=>gateway.submit({...draft,consentVersion:'old'},requestId),/동의/);assert.equal(calls.length,0);
  await assert.rejects(()=>gateway.submit(draft,requestId),/전송되지 않았/);
  assert.deepEqual(calls.map(c=>c.name),['emergency_service_status']);assert.ok(!JSON.stringify(calls).includes(draft.email));
  await assert.rejects(()=>emergencyGateway(null).submit(draft,requestId),/서버가 연결되지/);
  await assert.rejects(()=>emergencyGateway({...connection,user:async()=>null}).list('all'),/로그인이 필요/);
});

test('successful submission uses a stable request ID and requires a server acknowledgement',async()=>{
  const calls:{name:string;args?:Record<string,unknown>}[]=[];
  const connection:EmergencyTransport={user:async()=>({id:'member-A'}),call:async(name,args)=>{calls.push({name,args});return {data:name==='emergency_service_status'?access:{id:receiptId},error:null};}};
  assert.deepEqual(await emergencyGateway(connection).submit(draft,requestId),{id:receiptId});
  const submission=calls.find(c=>c.name==='submit_emergency_request')!;assert.equal(submission.args?.p_request_id,requestId);assert.equal(submission.args?.p_consent,true);assert.equal(submission.args?.p_consent_version,EMERGENCY_CONSENT_VERSION);assert.ok(!('p_user_id'in submission.args!));
  const invalid=emergencyGateway({...connection,call:async name=>({data:name==='emergency_service_status'?access:{},error:null})});
  await assert.rejects(()=>invalid.submit(draft,requestId),/접수 완료를 확인하지/);
});

test('ordinary members cannot fetch operator lists or records, even through a guessed hidden route',async()=>{
  const names:string[]=[];
  const connection:EmergencyTransport={user:async()=>({id:'ordinary-member'}),call:async name=>{names.push(name);return {data:name==='emergency_service_status'?access:[record],error:null};}};
  const gateway=emergencyGateway(connection);
  await assert.rejects(()=>gateway.list('all'),/운영자만/);await assert.rejects(()=>gateway.open(receiptId),/운영자만/);await assert.rejects(()=>gateway.resolve(receiptId),/운영자만/);
  assert.ok(names.every(name=>name==='emergency_service_status'));
  const ui=render(<EmergencyAdmin isDemoAccount={false} gateway={gateway} onHome={()=>{}}/>);
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'운영자 전용 게시판입니다.'})));
  assert.ok(ui.queryByText(draft.name)===null);assert.ok(ui.queryByText(draft.body)===null);
});

test('the demo emergency page has one help button, requires separate consent and never stores or sends personal fields',async()=>{
  let submissions=0;const ui=render(<EmergencyPage isDemoAccount gateway={fakeGateway({submit:async()=>{submissions++;return {id:receiptId};}})}/>);
  assert.equal(ui.getAllByRole('button').length,1);fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));
  assert.ok(ui.getByText('테스트 등록 화면입니다. 실제 개인정보를 입력하지 마세요.'));
  assert.ok(!ui.getByRole('checkbox').hasAttribute('checked'));fill(ui);fireEvent.click(ui.getByRole('checkbox'));
  const send=ui.getByRole('button',{name:'메세지보내기 (테스트)'}) as HTMLButtonElement;assert.equal(send.disabled,false);fireEvent.click(send);
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'작성·동의 테스트를 완료했습니다.'})));
  assert.ok(ui.getByText('운영자에게 전송된 요청은 없습니다.'));
  assert.ok(ui.queryByRole('heading',{name:'도움 요청이 접수되었습니다.'})===null);
  assert.equal(submissions,0);assert.ok(!storedValues().includes(draft.phone));assert.ok(!storedValues().includes(draft.location));
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));
  assert.equal((ui.getByLabelText('이름') as HTMLInputElement).value,'');assert.equal((ui.getByRole('checkbox') as HTMLInputElement).checked,false);
});

test('the form retains a failed draft, reuses its request ID on retry and clears personal data after acknowledged delivery',async()=>{
  const ids:string[]=[];const gateway=fakeGateway({submit:async(value,id)=>{ids.push(id);assert.equal(value.consent,true);if(ids.length===1)throw new Error('연결이 끊겼습니다. 다시 시도해 주세요.');return {id:receiptId};}});
  const ui=render(<EmergencyPage isDemoAccount={false} gateway={gateway}/>);
  fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));fill(ui);
  const send=ui.getByRole('button',{name:'메세지보내기'}) as HTMLButtonElement;assert.ok(send.disabled);
  fireEvent.click(ui.getByRole('checkbox'));await waitFor(()=>assert.equal(send.disabled,false));fireEvent.click(send);
  await waitFor(()=>assert.match(ui.getByRole('alert').textContent??'',/연결이 끊겼/));assert.equal((ui.getByLabelText('현위치') as HTMLInputElement).value,draft.location);
  fireEvent.click(ui.getByRole('button',{name:'메세지보내기'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'도움 요청이 접수되었습니다.'})));
  assert.equal(ids[0],ids[1]);assert.ok(ui.queryByDisplayValue(draft.email)===null);assert.ok(!storedValues().includes(draft.body));assert.ok(ui.getByText(receiptId));
});

test('verified operators can open private requests and mark them resolved without caching their contents',async()=>{
  let resolved=false;const gateway=fakeGateway({access:async()=>({...access,isAdmin:true}),list:async()=>[record],open:async()=>({...record,status:resolved?'resolved':'viewed'}),resolve:async()=>{resolved=true;}});
  const ui=render(<EmergencyAdmin isDemoAccount={false} gateway={gateway} onHome={()=>{}}/>);
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'긴급 요청함.'})));
  fireEvent.click(ui.getByRole('button',{name:new RegExp(draft.name)}));
  await waitFor(()=>assert.ok(ui.getByText(draft.body)));assert.ok(ui.getByText(draft.phone));assert.ok(ui.getByText(draft.location));
  fireEvent.click(ui.getByRole('button',{name:'처리 완료로 표시'}));await waitFor(()=>assert.ok(within(ui.getByRole('dialog')).getByText('처리 완료')));
  assert.equal(resolved,true);assert.ok(!storedValues().includes(draft.body));
});

test('compact intro prioritizes community and footer help opens the existing flow',async()=>{
  const hero=render(<HomeHero onCommunity={()=>{}} onPolls={()=>{}}/>);
  const community=hero.getByRole('button',{name:'커뮤니티 둘러보기'}),store=hero.getByRole('button',{name:'투표 둘러보기'});
  assert.ok(community.compareDocumentPosition(store)&Node.DOCUMENT_POSITION_FOLLOWING);cleanup();
  const ui=render(<Experience authenticated/>),dock=within(ui.getByRole('navigation',{name:'모바일 주 메뉴'}));
  assert.deepEqual(dock.getAllByRole('button').map(b=>b.textContent),['홈','소식','커뮤니티','투표','이벤트']);
  assert.ok(dock.getByRole('button',{name:'커뮤니티'}).querySelector('.dock-community-house .lucide-house'));
  assert.ok(dock.getByRole('button',{name:'이벤트'}).querySelector('.lucide-calendar-days'));
  assert.ok(!dock.getByRole('button',{name:'이벤트'}).querySelector('.lucide-house'));
  fireEvent.click(ui.getByRole('button',{name:'도움 안내'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'혼자 당황하지 마세요.'})));assert.equal(window.location.hash,'#emergency');
  fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));assert.ok(ui.getByLabelText('이름'));assert.ok(ui.queryByRole('button',{name:/비공개 긴급 요청함/})===null);
});

test('emergency terms and privacy open inside the form without navigating or losing the draft and consent',async()=>{
  window.history.replaceState(null,'','/#emergency');const start=window.location.href;
  const ui=render(<EmergencyPage isDemoAccount gateway={fakeGateway()}/>);
  fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));fill(ui);fireEvent.click(ui.getByRole('checkbox'));
  for(const [button,title] of [['이용약관 보기','이용약관'],['개인정보 처리방침 보기','개인정보 처리방침']]){
    fireEvent.click(ui.getByRole('button',{name:button}));
    const policy=ui.getByRole('region',{name:title});assert.ok(policy.textContent?.includes(title));
    assert.ok(ui.queryByRole('link',{name:/회원가입으로 돌아가기/})===null);assert.equal(window.location.href,start);
    const ids=Array.from(ui.container.querySelectorAll('[id]')).map(el=>el.id);assert.equal(new Set(ids).size,ids.length);
    fireEvent.click(ui.getByRole('button',{name:'약관 닫기'}));assert.ok(ui.queryByRole('region',{name:title})===null);
    assert.equal((ui.getByLabelText('이름') as HTMLInputElement).value,draft.name);assert.equal((ui.getByLabelText('현위치') as HTMLInputElement).value,draft.location);
    assert.equal((ui.getByLabelText('요청 내용') as HTMLTextAreaElement).value,draft.body);assert.equal((ui.getByRole('checkbox') as HTMLInputElement).checked,true);
  }
});

test('a request can retry readiness after initially unavailable intake and completes only after server acknowledgement',async()=>{
  let enabled=false,submissions=0;
  const connection:EmergencyTransport={user:async()=>({id:'real-member'}),call:async name=>{
    if(name==='emergency_service_status')return {data:{...access,enabled},error:null};
    submissions++;return {data:{id:receiptId},error:null};
  }};
  const ui=render(<EmergencyPage isDemoAccount={false} gateway={emergencyGateway(connection)}/>);
  fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));fill(ui);fireEvent.click(ui.getByRole('checkbox'));
  const send=ui.getByRole('button',{name:'메세지보내기'}) as HTMLButtonElement;assert.equal(send.disabled,false);fireEvent.click(send);
  await waitFor(()=>assert.match(ui.getByRole('alert').textContent??'',/메시지는 전송되지 않았습니다/));assert.equal(submissions,0);
  enabled=true;fireEvent.click(ui.getByRole('button',{name:'메세지보내기'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'도움 요청이 접수되었습니다.'})));assert.equal(submissions,1);
});
