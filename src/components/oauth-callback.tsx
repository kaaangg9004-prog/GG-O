'use client';

import {useLocalized} from '@/components/locale-provider';
import {useEffect,useRef,useState} from 'react';
import {getSupabase} from '@/lib/supabase-service';
import {hasRegistrationConsent} from '@/lib/registration-consent';
import {OAUTH_PENDING_KEY,pendingSocialSignup,resolveOAuthUser} from '@/lib/social-auth';
import {completeMemberConsent} from '@/lib/member-consent';
import {clearDemoLogin} from '@/lib/demo-login';
import {Logo} from './ui';

export default function OAuthCallback() {
  const localize=useLocalized();
  const [error,setError]=useState('');
  const completion=useRef<Promise<string>|null>(null);
  useEffect(()=>{document.title=localize.text('소셜 로그인 확인 · GG-O');},[localize.locale]);
  useEffect(()=>{
    let active=true;
    completion.current ??= (async () => {
      const params=new URLSearchParams(window.location.search);
      const client=getSupabase();if(!client)throw new Error('회원 시스템이 아직 연결되지 않았습니다. 로그인 화면으로 돌아가 주세요.');
      const user=await resolveOAuthUser(client,params);
      if(!await completeMemberConsent(client,user.id,!!pendingSocialSignup()&&hasRegistrationConsent()))return '/signup/?consent=required';
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      clearDemoLogin();
      return '/';
    })();
    completion.current.then(destination=>{
      if(!active)return;
      window.location.replace(destination);
    }).catch(error=>{if(active)setError(error instanceof Error?error.message:'로그인을 완료하지 못했습니다. 다시 시도해 주세요.');});
    return()=>{active=false;};
  },[]);
  return localize(<main className="oauth-callback"><Logo/><h1>{error?'로그인을 완료하지 못했어요.':'계정 연결을 확인하고 있어요.'}</h1><p role={error?'alert':'status'}>{error||'잠시만 기다려 주세요.'}</p>{error&&<><a className="button button-dark" href="/signup/">회원가입으로 돌아가기</a><a className="text-link" href="/?login=1">로그인으로 돌아가기</a></>}</main>);
}
