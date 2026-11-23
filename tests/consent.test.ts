import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {LEGAL_VERSION} from '../src/lib/legal';
import {CONSENT_KEY,hasRegistrationConsent,readRegistrationConsent,saveRegistrationConsent} from '../src/lib/registration-consent';
import {beginSocialLogin,beginSocialSignup,OAUTH_PENDING_KEY,pendingSocialSignup,resolveOAuthUser} from '../src/lib/social-auth';
import type {AuthError, Session, User} from '@supabase/supabase-js';
afterEach(()=>{localStorage.clear();sessionStorage.clear();});

test('consent carries a version and timestamps, rejects old or corrupt records, and can be withdrawn',()=>{
  assert.equal(hasRegistrationConsent(),false);
  const saved=saveRegistrationConsent(true);assert.equal(saved.version,LEGAL_VERSION);assert.ok(saved.acceptedAt);assert.equal(hasRegistrationConsent(),true);
  localStorage.setItem(CONSENT_KEY,JSON.stringify({...saved,version:'old-version'}));assert.equal(readRegistrationConsent(),null);
  localStorage.setItem(CONSENT_KEY,'broken JSON');assert.equal(hasRegistrationConsent(),false);
  saveRegistrationConsent(false);assert.equal(readRegistrationConsent()?.accepted,false);assert.equal(readRegistrationConsent()?.acceptedAt,null);
});

test('both providers use the controlled PKCE callback and cannot start before consent',async()=>{
  const requests:unknown[]=[];
  const client={auth:{signInWithOAuth:async(input:Parameters<NonNullable<Parameters<typeof beginSocialSignup>[1]>['auth']['signInWithOAuth']>[0])=>{requests.push(input);return {data:{provider:input.provider,url:'https://provider.example/authorize'},error:null};}}};
  await assert.rejects(()=>beginSocialSignup('google',client,'https://ggo.example'),/먼저 동의/);assert.equal(requests.length,0);
  saveRegistrationConsent(true);
  await beginSocialSignup('google',client,'https://ggo.example');
  await beginSocialSignup('facebook',client,'https://ggo.example');
  assert.deepEqual(requests,[{provider:'google',options:{redirectTo:'https://ggo.example/auth/callback/',queryParams:{prompt:'select_account'}}},{provider:'facebook',options:{redirectTo:'https://ggo.example/auth/callback/',scopes:'email'}}]);
  assert.equal(pendingSocialSignup()?.provider,'facebook');
});

test('failed or missing OAuth connections do not leave a fake in-progress login',async()=>{
  saveRegistrationConsent(true);
  await assert.rejects(()=>beginSocialSignup('google',null,'https://ggo.example'),/소셜 로그인을 준비/);assert.equal(sessionStorage.getItem(OAUTH_PENDING_KEY),null);
  const client={auth:{signInWithOAuth:async()=>{throw new Error('Provider is not enabled');}}};
  await assert.rejects(()=>beginSocialSignup('google',client,'https://ggo.example'),/시작하지 못했습니다/);
  assert.equal(pendingSocialSignup(),null);
});


test('returning login starts OAuth without device-local consent and clears old signup intent',async()=>{
  sessionStorage.setItem(OAUTH_PENDING_KEY,JSON.stringify({version:LEGAL_VERSION,provider:'google',startedAt:Date.now()}));
  let started=false;
  const client={auth:{signInWithOAuth:async()=>{started=true;return {data:{provider:'google' as const,url:'https://provider.example/authorize'},error:null};}}};
  await beginSocialLogin('google',client,'https://ggo.example');
  assert.equal(started,true);assert.equal(hasRegistrationConsent(),false);assert.equal(pendingSocialSignup(),null);
});

test('a fresh callback exchanges the code before consulting any existing session', async () => {
  const user: User = {id: 'member', aud: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {}};
  const session: Session = {access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, user};
  const codes: string[] = [];
  const client = {auth: {
    async exchangeCodeForSession(code: string) {
      codes.push(code);
      return {data: {user, session}, error: null};
    },
    async getUser(): Promise<never> {
      throw new Error('An existing session cannot replace a fresh code.');
    },
  }};
  assert.equal(await resolveOAuthUser(client, new URLSearchParams('code=first-login')), user);
  assert.deepEqual(codes, ['first-login']);
  await assert.rejects(resolveOAuthUser(client, new URLSearchParams('error_code=access_denied')), /취소/);
  assert.deepEqual(codes, ['first-login']);
});

test('an invalid callback code does not sign in an older account', async () => {
  const client = {auth: {
    async exchangeCodeForSession() {
      return {data: {user: null, session: null}, error: new Error('invalid code') as AuthError};
    },
    async getUser(): Promise<never> {
      throw new Error('An invalid code cannot fall back to another account.');
    },
  }};
  await assert.rejects(resolveOAuthUser(client, new URLSearchParams('code=expired')), /로그인 정보를 확인하지 못했습니다/);
});
