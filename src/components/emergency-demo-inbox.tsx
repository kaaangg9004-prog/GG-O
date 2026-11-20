'use client';


import {useLocalized} from '@/components/locale-provider';
import {useState} from 'react';
import {ArrowUpRight,Check,ShieldCheck} from 'lucide-react';
import type {EmergencyDemoRecord} from '@/lib/emergency-demo';
import type {EmergencyState} from '@/lib/emergency';
import {dateLabel} from '@/lib/data';
import {EmptyState,Modal} from './ui';

export function EmergencyDemoInbox({records,onViewed,onResolved,onWrite}:{records:EmergencyDemoRecord[];onViewed:(id:string)=>void;onResolved:(id:string)=>void;onWrite:()=>void}) {
  const localize=useLocalized();
  const [filter,setFilter]=useState<'all'|EmergencyState>('all'),[selected,setSelected]=useState<string|null>(null);
  const list=records.filter(record=>filter==='all'||record.status===filter),active=records.find(record=>record.id===selected);
  return localize(<section className="shell section page-section emergency-admin">
    <div className="page-heading"><div><p className="eyebrow"><ShieldCheck size={15}/>요청 관리 미리보기</p><h1>요청 예시 보관함.</h1><p>이 탭에서 등록한 요청 예시의 내용과 처리 상태를 확인하세요.</p></div><button className="button button-dark" onClick={onWrite}>요청 작성 미리보기<ArrowUpRight size={17}/></button></div>
    <div className="catalog-notice"><strong>실제 신고·기관 연락은 진행되지 않습니다.</strong><p>이 탭에서만 임시로 보관하며 새로고침·로그아웃 시 삭제됩니다. 다른 기기나 실제 서버의 요청은 표시하지 않습니다. 실제 개인정보 대신 예시를 입력해 주세요.</p></div>
    <div className="tabs" aria-label="긴급 요청 예시 상태">{[['all','전체'],['new','접수'],['viewed','확인 중'],['resolved','처리 완료']].map(([value,label])=><button key={value} className={filter===value?'selected':''} aria-pressed={filter===value} onClick={()=>setFilter(value as typeof filter)}>{label}</button>)}</div>
    <p className="sample-note">이 탭의 요청 예시 {records.length}건 · 최근 50건까지 보관</p>
    {list.length?<div className="emergency-admin-list">{list.map(record=><button key={record.id} className="emergency-admin-row" onClick={()=>{setSelected(record.id);onViewed(record.id);}}><span className={`support-status ${record.status==='resolved'?'answered':''}`}>{record.status==='new'?'접수':record.status==='viewed'?'확인 중':'처리 완료'}</span><strong translate="no">{record.name}</strong><time>{dateLabel(record.createdAt)}</time><ArrowUpRight size={18}/></button>)}</div>:<EmptyState title="표시할 요청 예시이 없습니다." text="같은 탭에서 긴급 요청 예시를 작성하면 여기에 표시됩니다." action="긴급 요청 미리보기" onAction={onWrite}/>}
    {active&&<Modal title="긴급 요청 예시" close={()=>setSelected(null)} wide><article className="emergency-admin-detail"><p className="eyebrow">작성 예시 · {dateLabel(active.createdAt)}</p><h2>{active.name}님의 요청 예시</h2><dl>{[['연락처',active.phone],['메일주소',active.email],['현위치',active.location]].map(([label,value])=><div key={label}><dt>{label}</dt><dd translate="no">{value}</dd></div>)}</dl><h3>요청 내용</h3><p className="emergency-request-body" translate="no">{active.body}</p><div className="emergency-record-consent"><strong>예시 개인정보 수집·이용 동의 기록</strong><span>{dateLabel(active.consentedAt)} · {active.consentVersion}</span><span>임시 보관: 현재 탭 · 새로고침·로그아웃 시 삭제</span></div>{active.status==='resolved'?<p className="support-status answered">처리 완료</p>:<button className="button button-dark" onClick={()=>onResolved(active.id)}>처리 완료로 표시<Check size={17}/></button>}</article></Modal>}
  </section>);
}
