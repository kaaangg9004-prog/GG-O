'use client';


import {useLocalized} from '@/components/locale-provider';
import {useState} from 'react';
import {Check,Flag,RotateCcw,ShieldCheck,X} from 'lucide-react';
import type {LocalState} from '@/lib/types';
import {dateLabel} from '@/lib/data';
import {postReportCount,AUTO_HIDE_REPORTS} from '@/lib/board';
import {EmptyState} from './ui';

export function Moderation({state,onResolve,onRestore}:{state:LocalState;onResolve:(id:string,decision:'hidden'|'dismissed')=>void;onRestore:(id:string)=>void}) {
  const localize=useLocalized();
  const [filter,setFilter]=useState('pending');
  const reports=state.reports.filter(r=>filter==='all'||r.status===filter);
  const pending=state.reports.filter(r=>r.status==='pending').length;
  return localize(<section className="moderation-panel">
    <div className="moderation-notice"><ShieldCheck size={23}/><div><strong>신고 내용을 확인하고 처리할 수 있습니다.</strong><p>현재는 이 브라우저의 신고함입니다. 접수 즉시 목록에 표시되고, 숨김 조치는 게시판에 바로 반영됩니다. 실제 운영자 인증·다른 이용자 신고 수신·실시간 알림은 서버 연결이 필요합니다.</p></div></div>
    <div className="moderation-stats"><div><span>처리 대기</span><strong>{pending}</strong></div><div><span>숨김 처리</span><strong>{state.reports.filter(r=>r.status==='hidden').length}</strong></div><div><span>전체 신고</span><strong>{state.reports.length}</strong></div></div>
    <div className="board-category-tabs" aria-label="신고 상태">{[['pending','처리 대기'],['hidden','숨김 처리'],['dismissed','기각·해제'],['all','전체']].map(([id,label])=><button key={id} className={filter===id?'selected':''} onClick={()=>setFilter(id)}>{label}{id==='pending'&&<span className="queue-count">{pending}</span>}</button>)}</div>
    {reports.length?<div className="report-queue">{reports.map(report=><article className="report-ticket" key={report.id}><div className="report-ticket-top"><span><Flag size={15}/>{report.target.commentId?'댓글 신고':'게시글 신고'}</span><strong className={`report-status status-${report.status}`}>{report.status==='pending'?'처리 대기':report.status==='hidden'?'숨김 완료':'기각·해제'}</strong></div><h3>{report.reason}</h3>{!report.target.commentId&&<p className="report-unique-count">서로 다른 이용자 신고 {postReportCount(state,report.target.postId)}건 / {AUTO_HIDE_REPORTS}건{state.autoHiddenPosts.includes(report.target.postId)&&<strong> · 50건 누적: 우선 숨김 · 운영자 검토 필요</strong>}</p>}<blockquote translate="no">{report.excerpt}</blockquote>{report.detail&&<p><strong>추가 설명</strong> <span translate="no">{report.detail}</span></p>}<div className="report-ticket-meta"><span>접수 {dateLabel(report.createdAt)}</span>{report.resolvedAt&&<span>처리 {dateLabel(report.resolvedAt)}</span>}</div><div className="report-ticket-actions">{report.status==='pending'?<><button className="button button-dark" onClick={()=>onResolve(report.id,'hidden')}><ShieldCheck size={16}/>{report.target.commentId?'댓글 숨김':'게시글 숨김'}</button><button className="button button-light" onClick={()=>onResolve(report.id,'dismissed')}><X size={16}/>신고 기각</button></>:report.status==='hidden'?<button className="button button-light" onClick={()=>onRestore(report.id)}><RotateCcw size={16}/>숨김 해제</button>:<span className="resolved-note"><Check size={16}/>처리가 완료된 신고입니다.</span>}</div></article>)}</div>:<EmptyState title={filter==='pending'?'처리 대기 중인 신고가 없어요.':'해당 상태의 신고가 없어요.'} text="게시글이나 댓글의 신고 버튼으로 접수하면 이곳에서 확인할 수 있습니다."/>}
  </section>);
}
