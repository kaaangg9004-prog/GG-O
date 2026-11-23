import type {SupabaseClient} from '@supabase/supabase-js';
import {getSupabase} from './supabase-service';
import {hasRegistrationConsent} from './registration-consent';
import {LEGAL_VERSION} from './legal';

export type SocialProvider='google'|'facebook';
export const OAUTH_PENDING_KEY='ggo-oauth-pending-v1';
export const providerName=(provider:SocialProvider)=>provider==='google'?'구글':'페이스북';
type OAuthClient={auth:Pick<SupabaseClient['auth'],'signInWithOAuth'>};

// Consume a fresh PKCE code before reading the account. The session is persisted
// by Supabase before the promise resolves and before we navigate away.
export async function resolveOAuthUser(
  client: {auth: Pick<SupabaseClient['auth'], 'exchangeCodeForSession' | 'getUser'>},
  params: URLSearchParams,
) {
  if (params.has('error') || params.has('error_code')) {
    throw new Error('소셜 로그인이 취소되었거나 승인되지 않았습니다. 다시 시도해 주세요.');
  }
  const code = params.get('code');
  const result = code
    ? await client.auth.exchangeCodeForSession(code)
    : await client.auth.getUser();
  if (result.error || !result.data.user) {
    throw new Error('로그인 정보를 확인하지 못했습니다. 로그인 화면에서 다시 시도해 주세요.');
  }
  return result.data.user;
}
export function pendingSocialSignup() {
  try {
    const raw=sessionStorage.getItem(OAUTH_PENDING_KEY);if(!raw)return null;
    const pending=JSON.parse(raw);
    if(pending?.version!==LEGAL_VERSION||!['google','facebook'].includes(pending.provider)||typeof pending.startedAt!=='number'||Date.now()-pending.startedAt>30*60*1000)return null;
    return pending as {version:string;provider:SocialProvider;startedAt:number};
  }catch{return null;}
}
export async function beginSocialSignup(provider:SocialProvider,client:OAuthClient|null=getSupabase(),origin=window.location.origin) {
  if(!hasRegistrationConsent())throw new Error('이용약관과 개인정보 처리방침에 먼저 동의해 주세요.');
  return startSocialAuth(provider,client,origin,true);
}
export async function beginSocialLogin(provider:SocialProvider,client:OAuthClient|null=getSupabase(),origin=window.location.origin) {
  return startSocialAuth(provider,client,origin,false);
}
async function startSocialAuth(provider:SocialProvider,client:OAuthClient|null,origin:string,signup:boolean) {
  if(!client)throw new Error('소셜 로그인을 준비 중입니다.');
  try {sessionStorage.removeItem(OAUTH_PENDING_KEY);if(signup)sessionStorage.setItem(OAUTH_PENDING_KEY,JSON.stringify({version:LEGAL_VERSION,provider,startedAt:Date.now()}));}
  catch {throw new Error('로그인을 진행하려면 브라우저의 사이트 저장 기능을 허용해 주세요.');}
  try {
    const {data,error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:new URL('/auth/callback/',origin).href,
      ...(provider==='google'?{queryParams:{prompt:'select_account'}}:{scopes:'email'})}});
    if(error||!data.url)throw new Error('OAuth start failed');
  }catch {sessionStorage.removeItem(OAUTH_PENDING_KEY);throw new Error(`${providerName(provider)} 로그인을 시작하지 못했습니다. 계정 연결 설정을 확인한 뒤 다시 시도해 주세요.`);}
}
