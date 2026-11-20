'use client';

import {useLocalized} from '@/components/locale-provider';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase-service';
import {hasRegistrationConsent} from '@/lib/registration-consent';
import {OAUTH_PENDING_KEY,pendingSocialSignup} from '@/lib/social-auth';
import {completeMemberConsent} from '@/lib/member-consent';
import {clearDemoLogin} from '@/lib/demo-login';
import {Logo} from './ui';

export default function OAuthCallback() {
  const localize=useLocalized();
  const [error,setError]=useState('');
  useEffect(()=>{document.title=localize.text('소셜 로그인 확인 · GG-O');},[localize.locale]);
  useEffect(()=>{
    let active=true;
    const finish=async()=>{
      const params=new URLSearchParams(window.location.search);
      if(params.get('error'))throw new Error('소셜 로그인이 취소되었거나 승인되지 않았습니다. 다시 시도해 주세요.');
      const client=getSupabase();if(!client)throw new Error('회원 시스템이 아직 연결되지 않았습니다. 로그인 화면으로 돌아가 주세요.');
      const {data,error}=await client.auth.getUser();if(!active)return;
      if(error||!data.user)throw new Error('로그인 정보를 확인하지 못했습니다. 회원가입 화면에서 다시 시도해 주세요.');
      if(!await completeMemberConsent(client,data.user.id,!!pendingSocialSignup()&&hasRegistrationConsent())){window.location.replace('/signup/?consent=required');return;}
      if(!active)return;
      sessionStorage.removeItem(OAUTH_PENDING_KEY);clearDemoLogin();window.location.replace('/#my');
    };
    finish().catch(error=>{if(active)setError(error instanceof Error?error.message:'로그인을 완료하지 못했습니다. 다시 시도해 주세요.');});
    return()=>{active=false;};
  },[]);
  return localize(<main className="oauth-callback"><Logo/><h1>{error?'로그인을 완료하지 못했어요.':'계정 연결을 확인하고 있어요.'}</h1><p role={error?'alert':'status'}>{error||'잠시만 기다려 주세요.'}</p>{error&&<><a className="button button-dark" href="/signup/">회원가입으로 돌아가기</a><a className="text-link" href="/?login=1">로그인으로 돌아가기</a></>}</main>);
}
