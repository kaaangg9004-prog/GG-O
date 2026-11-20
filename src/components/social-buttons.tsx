'use client';

import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase-service';
import {backendConfig} from '@/lib/backend-config';
import {useLocalized} from '@/components/locale-provider';
import {beginSocialLogin,type SocialProvider} from '@/lib/social-auth';

function ProviderIcon({provider}:{provider:SocialProvider}) {
  const localize=useLocalized();
  if(provider==='facebook')return localize(<span className="facebook-symbol" aria-hidden="true">f</span>);
  return localize(<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.06.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.12-1.32.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.51l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>);
}
export function SocialLinks(){
  const localize=useLocalized(),connected=!!getSupabase(),[providers,setProviders]=useState<Record<string,boolean>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!connected)return;let active=true;fetch((process.env.NEXT_PUBLIC_SUPABASE_URL??backendConfig.url)+'/auth/v1/settings',{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??backendConfig.publishableKey}}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(s=>{if(active)setProviders(s.external??{});}).catch(()=>{if(active)setProviders({});});return()=>{active=false;};},[connected]);
  const enabled=(provider:SocialProvider)=>!connected||providers?.[provider]===true;
  return localize(<><div className="social-buttons" aria-label="소셜 계정으로 시작하기">{(['google','facebook'] as const).filter(p=>!connected||p==='google'||enabled(p)).map(provider=>enabled(provider)?<button type="button" className="social-button" key={provider} disabled={busy} onClick={async()=>{if(!connected){window.location.assign(`/signup/?provider=${provider}`);return;}setBusy(true);setError('');try{await beginSocialLogin(provider);}catch(e){setError(e instanceof Error?e.message:'로그인을 시작하지 못했습니다.');setBusy(false);}}}><ProviderIcon provider={provider}/>{provider==='google'?'구글로 계속하기':'페이스북으로 계속하기'}</button>:<button type="button" className="social-button" key={provider} disabled><ProviderIcon provider={provider}/>{providers?'로그인 연결 준비 중':'로그인 상태 확인 중'}</button>)}</div>{error&&<p role="alert">{error}</p>}{connected&&providers&&!providers.google&&<p role="status">회원 로그인 연결을 준비하고 있습니다. 콘텐츠는 로그인 없이 둘러볼 수 있습니다.</p>}</>);
}
export function SocialChoices({selected,onSelect,disabled=false}:{selected:SocialProvider;onSelect:(provider:SocialProvider)=>void;disabled?:boolean}) {
  const localize=useLocalized();
  return localize(<div className="social-buttons" aria-label="가입할 소셜 계정 선택">{(['google','facebook'] as const).map(provider=><button type="button" key={provider} disabled={disabled} className={`social-button ${selected===provider?'selected':''}`} aria-pressed={selected===provider} onClick={()=>onSelect(provider)}><ProviderIcon provider={provider}/>{provider==='google'?'구글 계정으로 가입':'페이스북 계정으로 가입'}<span className="provider-check" aria-hidden="true">{selected===provider?'✓':''}</span></button>)}</div>);
}
