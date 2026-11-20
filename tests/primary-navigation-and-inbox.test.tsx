import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import Experience from '../src/components/experience';
import DemoAccess from '../src/components/demo-access';
import {canUseEmergencyDemoInbox} from '../src/lib/emergency-demo';

const example={name:'테스트 여행자',phone:'+82 10 0000 0000',email:'traveler@example.com',location:'서울역 1번 출구 (예시)',body:'Tôi cần hỗ trợ liên hệ với cơ quan công cộng.'};
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});
async function logIn(ui:ReturnType<typeof render>) {
  fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'로그인'}));
  fireEvent.change(ui.getByLabelText('아이디'),{target:{value:'bbbb'}});fireEvent.change(ui.getByLabelText('비밀번호',{exact:true}),{target:{value:'0000'}});
  fireEvent.click(within(ui.getByRole('dialog',{name:'로그인'})).getByRole('button',{name:'로그인'}));await waitFor(()=>assert.ok(ui.getByRole('navigation',{name:'주 메뉴'})));
}
async function submitTest(ui:ReturnType<typeof render>) {
  fireEvent.click(ui.getByRole('button',{name:'도움 안내'}));
  fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));
  for(const [label,value] of [['이름',example.name],['연락처',example.phone],['메일주소',example.email],['현위치',example.location],['요청 내용',example.body]])fireEvent.change(ui.getByLabelText(label),{target:{value}});
  fireEvent.click(ui.getByRole('checkbox'));fireEvent.click(ui.getByRole('button',{name:'메세지보내기 (테스트)'}));
  await waitFor(()=>assert.ok(ui.getByRole('button',{name:'긴급 요청함 보기 (테스트)'})));
  fireEvent.click(ui.getByRole('button',{name:'긴급 요청함 보기 (테스트)'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'긴급 요청함 (테스트).'})));
}
function storedValues(){return [...Object.keys(localStorage).map(key=>localStorage.getItem(key)),...Object.keys(sessionStorage).map(key=>sessionStorage.getItem(key))].join('');}

test('desktop icons and mobile dock share the requested five destinations while magazine content stays available',async()=>{
  const ui=render(<Experience authenticated/>),desktop=within(ui.getByRole('navigation',{name:'주 메뉴'})),mobile=within(ui.getByRole('navigation',{name:'모바일 주 메뉴'}));
  const expected=['홈','소식','커뮤니티','투표','이벤트'];
  assert.deepEqual(desktop.getAllByRole('link').map(link=>link.textContent),expected);assert.deepEqual(mobile.getAllByRole('button').map(button=>button.textContent),expected);
  assert.ok(desktop.getByRole('link',{name:'커뮤니티'}).querySelector('.lucide-house'));assert.ok(desktop.getByRole('link',{name:'이벤트'}).querySelector('.lucide-calendar-days'));
  fireEvent.click(ui.getByRole('button',{name:'메뉴 열기'}));fireEvent.click(within(ui.getByRole('navigation',{name:'모바일 메뉴'})).getByRole('button',{name:'매거진'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'새로운 취향을 발견해요.'})));assert.equal(document.title,'매거진 · GG-O');
});

test('BBBB can open a hidden test inbox, read submitted content and mark it resolved without persistent storage',async()=>{
  const ui=render(<DemoAccess/>);await logIn(ui);await submitTest(ui);
  fireEvent.click(ui.getByRole('button',{name:new RegExp(example.name)}));
  await waitFor(()=>assert.ok(ui.getByText(example.body)));assert.ok(ui.getByText(example.phone));assert.ok(ui.getByText(example.location));
  fireEvent.click(ui.getByRole('button',{name:'처리 완료로 표시'}));assert.ok(within(ui.getByRole('dialog')).getByText('처리 완료'));
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));fireEvent.click(within(ui.getByRole('navigation',{name:'주 메뉴'})).getByRole('link',{name:'홈'}));
  fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'긴급 요청함 (테스트)'}));
  assert.ok(ui.getByRole('button',{name:new RegExp(example.name)}));
  for(const value of Object.values(example))assert.ok(!storedValues().includes(value));
  fireEvent.click(ui.getAllByRole('button',{name:'로그아웃'})[0]);await logIn(ui);
  fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'긴급 요청함 (테스트)'}));
  assert.ok(ui.getByRole('heading',{name:'표시할 테스트 요청이 없습니다.'}));assert.ok(ui.queryByText(example.body)===null);
});

test('reloading a signed-in demo clears the tab-only emergency inbox',async()=>{
  let ui=render(<DemoAccess/>);await logIn(ui);await submitTest(ui);assert.ok(ui.getByRole('button',{name:new RegExp(example.name)}));
  cleanup();ui=render(<DemoAccess/>);
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'긴급 요청함 (테스트).'})));
  assert.ok(ui.getByRole('heading',{name:'표시할 테스트 요청이 없습니다.'}));assert.ok(ui.queryByRole('button',{name:new RegExp(example.name)})===null);
});

test('AAAA and real accounts named BBBB receive no test administrator shortcut',async()=>{
  assert.equal(canUseEmergencyDemoInbox(false,'BBBB'),false);assert.equal(canUseEmergencyDemoInbox(true,'AAAA'),false);assert.equal(canUseEmergencyDemoInbox(true,'bbbb'),true);
  window.history.replaceState(null,'','/#emergency-admin');const ui=render(<Experience authenticated isDemoAccount={false} accountLabel="BBBB"/>);
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'운영자 전용 게시판입니다.'})));
  assert.ok(within(ui.getByRole('banner')).queryByRole('button',{name:'긴급 요청함 (테스트)'})===null);assert.ok(ui.queryByText(example.body)===null);
});
