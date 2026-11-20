import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import DemoAccess from '../src/components/demo-access';
import {DEMO_LOGIN_KEY,readDemoLogin} from '../src/lib/demo-login';
import {readState,STORAGE_KEY} from '../src/lib/store';
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});
function loginForm(ui:ReturnType<typeof render>){fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'로그인'}));return within(ui.getByRole('dialog',{name:'로그인'}));}

test('login popup rejects incorrect credentials, accepts AAAA/0000 and survives reload while the homepage stays public',async()=>{
  let ui=render(<DemoAccess/>);assert.ok(ui.container.querySelector('.home-intro'));assert.ok(ui.queryByRole('dialog')===null);const form=loginForm(ui);
  fireEvent.change(form.getByLabelText('아이디'),{target:{value:'AAAA'}});fireEvent.change(form.getByLabelText('비밀번호',{exact:true}),{target:{value:'1111'}});fireEvent.click(form.getByRole('button',{name:'로그인'}));assert.match(form.getByRole('alert').textContent??'',/아이디 또는 비밀번호/);assert.equal(readDemoLogin(),false);
  fireEvent.change(form.getByLabelText('비밀번호',{exact:true}),{target:{value:'0000'}});fireEvent.click(form.getByRole('button',{name:'로그인'}));await waitFor(()=>assert.ok(ui.queryByRole('dialog')===null));assert.ok(within(ui.getByRole('banner')).getByRole('button',{name:'로그아웃'}));assert.equal(sessionStorage.getItem(DEMO_LOGIN_KEY),'AAAA');assert.equal(localStorage.getItem(DEMO_LOGIN_KEY),null);
  cleanup();ui=render(<DemoAccess/>);await waitFor(()=>assert.ok(within(ui.getByRole('banner')).getByRole('button',{name:'로그아웃'})));assert.ok(ui.container.querySelector('.home-intro'));
});

test('remember login persists locally and logout returns to guest browsing without deleting existing data',async()=>{
  const state=readState(null);state.favorites=['ggo-tote'];localStorage.setItem(STORAGE_KEY,JSON.stringify(state));let ui=render(<DemoAccess/>);const form=loginForm(ui);
  fireEvent.change(form.getByLabelText('아이디'),{target:{value:'AAAA'}});fireEvent.change(form.getByLabelText('비밀번호',{exact:true}),{target:{value:'0000'}});fireEvent.click(form.getByLabelText('로그인 상태 유지'));fireEvent.click(form.getByRole('button',{name:'로그인'}));assert.equal(localStorage.getItem(DEMO_LOGIN_KEY),'AAAA');assert.equal(sessionStorage.getItem(DEMO_LOGIN_KEY),null);
  cleanup();ui=render(<DemoAccess/>);await waitFor(()=>assert.ok(ui.getByRole('button',{name:'내 활동'})));fireEvent.click(ui.getByRole('button',{name:'내 활동'}));assert.ok(ui.getByText('로그인한 테스트 계정'));fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'로그아웃'}));assert.ok(ui.container.querySelector('.home-intro'));assert.ok(within(ui.getByRole('banner')).getByRole('button',{name:'로그인'}));assert.equal(readDemoLogin(),false);assert.deepEqual(readState(localStorage.getItem(STORAGE_KEY)).favorites,['ggo-tote']);
});

test('password visibility works and an invalid stored account leaves the site in guest mode',()=>{
  localStorage.setItem(DEMO_LOGIN_KEY,'not-a-valid-demo-account');const ui=render(<DemoAccess/>);assert.ok(within(ui.getByRole('banner')).queryByRole('button',{name:'로그아웃'})===null);const form=loginForm(ui),password=form.getByLabelText('비밀번호',{exact:true}) as HTMLInputElement;assert.equal(password.type,'password');fireEvent.click(form.getByRole('button',{name:'비밀번호 보기'}));assert.equal(password.type,'text');fireEvent.click(form.getByRole('button',{name:'비밀번호 숨기기'}));assert.equal(password.type,'password');
});
