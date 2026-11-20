import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,within} from '@testing-library/react';
import Experience from '../src/components/experience';
import {BoardDetail} from '../src/components/board';
import Signup from '../src/components/signup';
import OAuthCallback from '../src/components/oauth-callback';
import {readState} from '../src/lib/store';
import {seedPosts} from '../src/lib/data';
import {hasRegistrationConsent,CONSENT_KEY} from '../src/lib/registration-consent';
import {DEMO_LOGIN_KEY} from '../src/lib/demo-login';
import {OAUTH_PENDING_KEY} from '../src/lib/social-auth';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});

test('the dialog close toolbar is outside scrolling content and still closes after content scroll',()=>{
  window.history.replaceState(null,'','/#community');
  const ui=render(<Experience authenticated/>);fireEvent.click(ui.getByText(seedPosts[0].title));
  const dialog=ui.getByRole('dialog'),body=dialog.querySelector<HTMLElement>('.modal-body');assert.ok(body);
  const close=within(dialog).getByRole('button',{name:'닫기'});
  assert.equal(close.closest('.modal-body'),null);assert.ok(close.closest('.modal-heading'));
  body.scrollTop=1600;fireEvent.scroll(body);fireEvent.click(close);
  assert.equal(ui.queryByRole('dialog'),null);assert.equal(document.body.style.overflow,'');
});

test('opening and reopening a report scrolls to the visible form, focuses reason, and typing does not scroll',t=>{
  const calls:{node:HTMLElement;options?:boolean|ScrollIntoViewOptions}[]=[];
  t.mock.method(HTMLElement.prototype,'scrollIntoView',function(this:HTMLElement,options?:boolean|ScrollIntoViewOptions){calls.push({node:this,options});});
  const ui=render(<BoardDetail post={seedPosts[0]} state={readState(null)} onComment={()=>true} onLike={()=>{}} onSave={()=>{}} onReport={()=>true} onBack={()=>{}}/>);
  fireEvent.click(ui.getByRole('button',{name:'게시글 신고'}));
  const form=ui.getByRole('form',{name:'게시글 신고 양식'});
  assert.equal(calls.length,1);assert.equal(calls[0].node,form);assert.deepEqual(calls[0].options,{behavior:'smooth',block:'start',inline:'nearest'});
  assert.equal(document.activeElement,within(form).getByLabelText('신고 사유'));
  fireEvent.change(within(form).getByLabelText('추가 설명 (선택)'),{target:{value:'신고 내용 설명'}});assert.equal(calls.length,1);
  fireEvent.click(ui.getByRole('button',{name:'게시글 신고'}));assert.equal(calls.length,2);
  fireEvent.click(ui.getByRole('button',{name:'댓글 신고'}));assert.equal(calls.length,3);
  assert.equal(calls[2].node,ui.getByRole('form',{name:'댓글 신고 양식'}));
});

test('report scrolling respects reduced-motion preference',t=>{
  t.mock.method(window,'matchMedia',(query:string)=>({matches:query.includes('prefers-reduced-motion'),media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}}));
  const calls:ScrollIntoViewOptions[]=[];
  t.mock.method(HTMLElement.prototype,'scrollIntoView',function(options:ScrollIntoViewOptions){calls.push(options);});
  const ui=render(<BoardDetail post={seedPosts[0]} state={readState(null)} onComment={()=>true} onLike={()=>{}} onSave={()=>{}} onReport={()=>true} onBack={()=>{}}/>);
  fireEvent.click(ui.getByRole('button',{name:'게시글 신고'}));assert.equal(calls[0].behavior,'auto');
});

test('signup requires stored consent, opens the supplied legal texts, and never fakes unconfigured social login',async()=>{
  const ui=render(<Signup/>),submit=ui.getByRole('button',{name:'동의하고 회원가입'}),checkbox=ui.getByRole('checkbox');
  assert.ok((submit as HTMLButtonElement).disabled);
  fireEvent.click(ui.getByRole('button',{name:'[이용약관]'}));
  assert.ok(ui.getByRole('heading',{name:'4. 면책 조항'}));assert.ok(ui.queryByText(/Điều khoản miễn trừ trách nhiệm:/)===null);
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));assert.equal((checkbox as HTMLInputElement).checked,false);
  fireEvent.click(ui.getByRole('button',{name:'[개인정보 처리방침]'}));
  assert.ok(ui.getByRole('heading',{name:'3. 개인정보의 보호 및 제3자 제공 금지'}));
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));
  fireEvent.click(checkbox);assert.equal(hasRegistrationConsent(),true);assert.ok(JSON.parse(localStorage.getItem(CONSENT_KEY)!).acceptedAt);
  assert.equal((submit as HTMLButtonElement).disabled,false);
  fireEvent.click(ui.getByRole('button',{name:'페이스북 계정으로 가입'}));assert.equal(ui.getByRole('button',{name:'페이스북 계정으로 가입'}).getAttribute('aria-pressed'),'true');
  fireEvent.click(submit);
  assert.match((await ui.findByRole('alert')).textContent??'',/소셜 로그인 연결을 준비/);
  assert.equal(sessionStorage.getItem(OAUTH_PENDING_KEY),null);assert.equal(sessionStorage.getItem(DEMO_LOGIN_KEY),null);
});

test('fresh signup always starts unchecked even with previously accepted current terms',()=>{
  let ui=render(<Signup/>);fireEvent.click(ui.getByRole('checkbox'));assert.equal(hasRegistrationConsent(),true);cleanup();ui=render(<Signup/>);
  assert.equal((ui.getByRole('checkbox') as HTMLInputElement).checked,false);
  assert.ok((ui.getByRole('button',{name:'동의하고 회원가입'}) as HTMLButtonElement).disabled);
  assert.equal(hasRegistrationConsent(),true,'opening a fresh form does not silently revoke a previous record');
  fireEvent.click(ui.getByRole('checkbox'));assert.ok(!(ui.getByRole('button',{name:'동의하고 회원가입'}) as HTMLButtonElement).disabled);
  fireEvent.click(ui.getByRole('checkbox'));assert.equal(hasRegistrationConsent(),false);
  assert.ok((ui.getByRole('button',{name:'동의하고 회원가입'}) as HTMLButtonElement).disabled);
});

test('an unconfigured OAuth callback gives a Korean error instead of a false signed-in state',async()=>{
  const ui=render(<OAuthCallback/>);
  assert.match((await ui.findByRole('alert')).textContent??'',/회원 시스템이 아직 연결되지/);
  assert.ok(ui.getByRole('link',{name:'회원가입으로 돌아가기'}));
  assert.equal(sessionStorage.getItem(DEMO_LOGIN_KEY),null);
});
