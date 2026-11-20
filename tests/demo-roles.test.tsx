import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import DemoAccess from '../src/components/demo-access';
import Experience from '../src/components/experience';
import {acceptsDemoLogin,DEMO_LOGIN_KEY,isDemoAdminAccount,readDemoAccount,saveDemoLogin} from '../src/lib/demo-login';
import {readState,STORAGE_KEY} from '../src/lib/store';
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});
const header=(ui:ReturnType<typeof render>)=>within(ui.getByRole('banner'));
const nav=(ui:ReturnType<typeof render>)=>within(ui.getByRole('navigation',{name:'주 메뉴'}));
async function login(ui:ReturnType<typeof render>,id:'AAAA'|'BBBB',remember=false){
 fireEvent.click(header(ui).getByRole('button',{name:'로그인'}));const form=within(ui.getByRole('dialog',{name:'로그인'}));
 fireEvent.change(form.getByLabelText('아이디'),{target:{value:id.toLowerCase()}});fireEvent.change(form.getByLabelText('비밀번호',{exact:true}),{target:{value:'0000'}});
 if(remember)fireEvent.click(form.getByRole('checkbox'));fireEvent.click(form.getByRole('button',{name:'로그인'}));await waitFor(()=>assert.ok(header(ui).getByRole('button',{name:'로그아웃'})));
}
async function logout(ui:ReturnType<typeof render>){fireEvent.click(header(ui).getByRole('button',{name:'로그아웃'}));await waitFor(()=>assert.ok(header(ui).getByRole('button',{name:'로그인'})));}

test('both demo accounts accept only the configured password and old AAAA sessions retain ordinary-member access',()=>{
 for(const id of ['AAAA','aaaa',' BBBB ','bbbb'])assert.equal(acceptsDemoLogin(id,'0000'),true);
 for(const [id,password] of [['CCCC','0000'],['BBBB','0001'],['AAAA','00000']])assert.equal(acceptsDemoLogin(id,password),false);
 sessionStorage.setItem(DEMO_LOGIN_KEY,'AAAA');assert.equal(readDemoAccount(),'AAAA');assert.equal(isDemoAdminAccount(true,readDemoAccount()!),false);
 assert.equal(saveDemoLogin(true,'BBBB'),true);assert.equal(readDemoAccount(),'BBBB');assert.equal(sessionStorage.getItem(DEMO_LOGIN_KEY),null);assert.equal(localStorage.getItem(DEMO_LOGIN_KEY),'BBBB');
 assert.equal(isDemoAdminAccount(false,'BBBB'),false);
});

test('AAAA sees member controls while BBBB receives poll/event/report/emergency/support management',async()=>{
 const ui=render(<DemoAccess/>);
 for(const account of ['AAAA','BBBB'] as const){await login(ui,account);const admin=account==='BBBB';assert.ok(ui.getByText(admin?'운영자 시점':'일반 사용자 시점',{exact:true}));assert.equal(!!header(ui).queryByRole('button',{name:'긴급 요청함 (테스트)'}),admin);
  fireEvent.click(nav(ui).getByRole('link',{name:'커뮤니티'}));assert.equal(!!ui.queryByRole('button',{name:'신고 관리 테스트'}),admin);
  fireEvent.click(nav(ui).getByRole('link',{name:'투표'}));assert.equal(!!ui.queryByRole('button',{name:'투표글 등록'}),admin);assert.equal(!!ui.container.querySelector('.poll-card-ops'),admin);
  fireEvent.click(nav(ui).getByRole('link',{name:'이벤트'}));assert.equal(!!ui.queryByRole('button',{name:'이벤트 등록'}),admin);
  fireEvent.click(header(ui).getByRole('button',{name:'고객지원'}));await waitFor(()=>assert.ok(ui.getByText(admin?'전체 문의':'내 문의',{exact:true})));assert.equal(ui.queryByRole('button',{name:'운영자 화면 체험'}),null);
  await logout(ui);
 }
});

test('remembered BBBB restores its administrator view and switching to AAAA removes privileged routes',async()=>{
 let ui=render(<DemoAccess/>);await login(ui,'BBBB',true);cleanup();ui=render(<DemoAccess/>);await waitFor(()=>assert.ok(header(ui).getByRole('button',{name:'긴급 요청함 (테스트)'})));assert.equal(readDemoAccount(),'BBBB');
 await logout(ui);await login(ui,'AAAA');assert.equal(header(ui).queryByRole('button',{name:'긴급 요청함 (테스트)'}),null);cleanup();window.history.replaceState(null,'','/#admin');ui=render(<DemoAccess/>);assert.ok(ui.getByRole('heading',{name:'운영자 권한이 필요합니다.'}));assert.equal(ui.queryByRole('button',{name:'게시글 숨김'}),null);
});

test('account changes received from another tab clear administrator state and identity together',async()=>{
 saveDemoLogin(true,'BBBB');const ui=render(<DemoAccess/>);await waitFor(()=>assert.ok(header(ui).getByRole('button',{name:'긴급 요청함 (테스트)'})));
 localStorage.setItem(DEMO_LOGIN_KEY,'AAAA');fireEvent(window,new window.StorageEvent('storage',{key:DEMO_LOGIN_KEY,newValue:'AAAA'}));await waitFor(()=>assert.equal(header(ui).queryByRole('button',{name:'긴급 요청함 (테스트)'}),null));assert.ok(ui.getByText('일반 사용자 시점',{exact:true}));
});

test('switching accounts preserves shared posts but separates authorship and each member ballot',async()=>{
 const ui=render(<DemoAccess/>);await login(ui,'AAAA');fireEvent.click(nav(ui).getByRole('link',{name:'커뮤니티'}));fireEvent.click(ui.getByRole('button',{name:'글쓰기'}));
 fireEvent.change(ui.getByLabelText('제목'),{target:{value:'AAAA가 작성한 테스트 글'}});fireEvent.change(ui.getByLabelText('내용'),{target:{value:'두 테스트 계정의 작성자를 구분합니다.'}});fireEvent.click(ui.getByRole('button',{name:'익명으로 등록하기'}));fireEvent.click(ui.getByText('AAAA가 작성한 테스트 글'));assert.ok(ui.getByRole('button',{name:'이 기기에서 내 글 삭제'}));fireEvent.click(ui.getByRole('button',{name:'닫기'}));
 fireEvent.click(nav(ui).getByRole('link',{name:'투표'}));fireEvent.click(ui.container.querySelector('.poll-card-open')!);for(const group of ui.container.querySelectorAll('.poll-question'))fireEvent.click(group.querySelector('input')!);fireEvent.click(ui.getByRole('button',{name:'참여'}));await waitFor(()=>assert.ok(ui.getByText('참여를 완료했습니다.')));await logout(ui);
 await login(ui,'BBBB');fireEvent.click(nav(ui).getByRole('link',{name:'투표'}));fireEvent.click(ui.container.querySelector('.poll-card-open')!);assert.equal(ui.queryByText('참여를 완료했습니다.'),null);assert.ok(ui.getAllByRole('radio').length>0);fireEvent.click(ui.getByRole('button',{name:'닫기'}));
 fireEvent.click(nav(ui).getByRole('link',{name:'커뮤니티'}));fireEvent.click(ui.getByText('AAAA가 작성한 테스트 글'));assert.equal(ui.queryByRole('button',{name:'이 기기에서 내 글 삭제'}),null);fireEvent.change(ui.getByLabelText('익명으로 댓글 쓰기'),{target:{value:'BBBB가 남긴 답글'}});fireEvent.click(ui.getByRole('button',{name:'댓글 등록'}));assert.ok(within(ui.getByTestId('anonymous-comment')).getByText('익명 1'));const state=readState(localStorage.getItem(STORAGE_KEY));assert.notEqual(state.posts[0].ownerKey,state.posts[0].comments[0].ownerKey);assert.equal(state.pollBallots.length,1);
});

test('a live account named BBBB never gains demo administration from its label',()=>{
 window.history.replaceState(null,'','/#admin');const ui=render(<Experience authenticated isDemoAccount={false} accountLabel="BBBB"/>);assert.ok(ui.getByRole('heading',{name:'운영자 권한이 필요합니다.'}));assert.equal(header(ui).queryByRole('button',{name:'긴급 요청함 (테스트)'}),null);
});
