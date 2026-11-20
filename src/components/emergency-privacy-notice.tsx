'use client';


import {useLocalized} from '@/components/locale-provider';
import {useId} from 'react';
import {emergencyPrivacyNotice} from '@/lib/emergency';

export function EmergencyPrivacyNotice({noticeId,onViewPolicy,policyView,disabled=false}:{noticeId?:string;onViewPolicy?:(kind:'terms'|'privacy')=>void;policyView?:'terms'|'privacy'|null;disabled?:boolean}) {
  const localize=useLocalized();
  const generatedId=useId(),id=noticeId??`${generatedId}-privacy-notice`;
  return localize(<div className="emergency-privacy-notice" id={id}><h3>개인정보 수집·이용 안내</h3><dl>{[['수집·이용 주체',emergencyPrivacyNotice.controller],['이용 목적',emergencyPrivacyNotice.purpose],['수집 항목',emergencyPrivacyNotice.items],['보유·이용 기간',emergencyPrivacyNotice.retention],['동의 거부',emergencyPrivacyNotice.refusal]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{emergencyPrivacyNotice.rights}</p>{onViewPolicy&&<div className="emergency-policy-links">{([['terms','이용약관 보기'],['privacy','개인정보 처리방침 보기']] as const).map(([kind,label])=><button type="button" key={kind} id={`${id}-${kind}-link`} disabled={disabled} onClick={()=>onViewPolicy(kind)} aria-expanded={policyView===kind} aria-controls={`${id}-document`}>{label}</button>)}</div>}</div>);
}
