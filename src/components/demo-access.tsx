'use client';

import {useLocalized} from './locale-provider';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ADMIN_NOTICE_KEY} from '@/lib/admin-notice';
import {clearDemoLogin} from '@/lib/demo-login';
import {getSupabase} from '@/lib/supabase-service';
import {hasMemberConsent} from '@/lib/member-consent';
import Experience from './experience';
import {Modal} from './ui';
import {SocialLinks} from './social-buttons';

export default function DemoAccess(){
  const localize=useLocalized();
  const [loggedIn,setLoggedIn]=useState(false),[checking,setChecking]=useState(true),[loginRequested,setLoginRequested]=useState(false),[generation,setGeneration]=useState(0);
  const [memberIdentity,setMemberIdentity]=useState<{id:string;joinedAt:string}|null>(null),[accountLabel,setAccountLabel]=useState(''),[authError,setAuthError]=useState('');
  const pending=useRef<(()=>void)|null>(null),logged=useRef(loggedIn);logged.current=loggedIn;
  const requestAuth=useCallback((resume?:()=>void)=>{if(logged.current){resume?.();return;}pending.current=resume??null;setLoginRequested(true);},[]);
  const closeLogin=()=>{setLoginRequested(false);pending.current=null;};
  useEffect(()=>{
    let active=true;
    const client=getSupabase();
    clearDemoLogin();
    const url=new URL(window.location.href);
    if (url.searchParams.has('code') || url.searchParams.has('error_code')) {
      window.location.replace('/auth/callback/' + url.search);
      return;
    }
    if(url.searchParams.get('login')==='1'){setLoginRequested(true);url.searchParams.delete('login');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}
    if(!client)setChecking(false);
    else client.auth.getUser().then(async({data})=>{
      if(!active||!data.user)return;
      if(!await hasMemberConsent(client,data.user.id)){if(active)window.location.replace('/signup/?consent=required');return;}
      const {data:profile}=await client.from('profiles').select('handle').eq('id',data.user.id).maybeSingle();if(!active)return;
      setMemberIdentity({id:data.user.id,joinedAt:data.user.created_at});setAccountLabel(profile?.handle??data.user.email??'소셜 로그인 회원');setLoggedIn(true);
    }).catch(()=>{if(active)setAuthError('가입 동의 기록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}).finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!loggedIn)return;setLoginRequested(false);const resume=pending.current;pending.current=null;resume?.();},[loggedIn]);
  const logout=async()=>{
    const client=getSupabase();if(client){const {error}=await client.auth.signOut();if(error){setAuthError('로그아웃하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');return;}}
    if (memberIdentity) {
      try { sessionStorage.removeItem(ADMIN_NOTICE_KEY + memberIdentity.id); } catch {}
    }
    clearDemoLogin();pending.current=null;setMemberIdentity(null);setLoggedIn(false);setAuthError('');setAccountLabel('');setLoginRequested(false);window.history.replaceState(null,'','/');setGeneration(value=>value+1);window.scrollTo({top:0});
  };
  return localize(<>{authError&&<div className="session-note" role="alert">{authError}</div>}<Experience key={generation} authenticated={loggedIn} onRequireAuth={requestAuth} onLogin={()=>requestAuth()} onLogout={logout} accountLabel={accountLabel} isDemoAccount={false} accountId={memberIdentity?.id} accountJoinedAt={memberIdentity?.joinedAt}/>{loginRequested&&!loggedIn&&!checking&&<Modal title="로그인" brand close={closeLogin}><LoginForm/></Modal>}</>);
}
export function LoginForm(){
  const localize=useLocalized();
  if(!getSupabase())return localize(<div className="auth-form"><p role="status">소셜 로그인을 준비 중입니다.</p></div>);
  return localize(<div className="auth-form">
    <p>Google 계정으로 로그인하면 다른 기기에서도 같은 계정으로 활동을 이어갈 수 있습니다.</p>
    <SocialLinks/>
  </div>);
}
