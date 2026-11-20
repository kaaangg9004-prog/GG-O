'use client';


import {useLocalized} from '@/components/locale-provider';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Check,CheckCircle2,LockKeyhole,MapPin,RefreshCw,ShieldCheck,Siren,X} from 'lucide-react';
import {EMERGENCY_CONSENT_VERSION,validateEmergencyDraft} from '@/lib/emergency';
import type {EmergencyAccess,EmergencyDraft,EmergencyGateway,EmergencyRecord,EmergencySummary,EmergencyState} from '@/lib/emergency';
import {emergencyGateway} from '@/lib/emergency-service';
import {dateLabel} from '@/lib/data';
import {EmptyState,Modal} from './ui';
import {EmergencyPrivacyNotice} from './emergency-privacy-notice';
import {LegalDocument,legalTitle} from './legal-document';
import type {LegalKind} from './legal-document';

const errorMessage=(error:unknown)=>error instanceof Error?error.message:'처리하지 못했습니다. 다시 시도해 주세요.';
export function EmergencyPage({isDemoAccount,authenticated=true,onRequireAuth,gateway:providedGateway,onTestRequest,onOpenTestInbox}:{isDemoAccount:boolean;authenticated?:boolean;onRequireAuth?:(resume:()=>void)=>void;gateway?:EmergencyGateway;onTestRequest?:(draft:EmergencyDraft)=>void;onOpenTestInbox?:()=>void}) {
  const localize=useLocalized();
  const gateway=useMemo(()=>providedGateway??emergencyGateway(),[providedGateway]);
  const [formOpen,setFormOpen]=useState(false),[receipt,setReceipt]=useState<string|null>(null),[access,setAccess]=useState<EmergencyAccess|null>(null);
  const [testComplete,setTestComplete]=useState(false);
  const [connectionNote,setConnectionNote]=useState(isDemoAccount?'미리보기에서는 메시지를 전송하지 않습니다.':'접수 가능 상태를 확인하고 있습니다.');
  useEffect(()=>{
    let active=true;if(isDemoAccount||!authenticated)return;
    gateway.access().then(state=>{if(!active)return;setAccess(state);setConnectionNote(state.enabled&&state.consentVersion===EMERGENCY_CONSENT_VERSION?'': '현재 긴급 요청 접수가 준비 중입니다. 메시지를 전송할 수 없습니다.');}).catch(e=>{if(active)setConnectionNote(errorMessage(e));});
    return()=>{active=false;};
  },[gateway,isDemoAccount,authenticated]);
  const enabled=!isDemoAccount&&access?.enabled===true&&access.consentVersion===EMERGENCY_CONSENT_VERSION;
  return localize(<section className="shell emergency-page">
    <div className="emergency-intro"><span className="emergency-symbol"><Siren size={35}/></span><p className="eyebrow">한국 여행 중 필요한 연락을 도와드려요</p><h1>혼자 당황하지 마세요.</h1><p className="emergency-use-notice">베트남어로 현재 상황을 보내주세요. 운영자가 메시지를 확인하고 한국 경찰·소방기관에 상황을 전달하거나 필요한 공공기관과 연락하는 일을 도와드릴 수 있습니다.</p><p className="emergency-false-report-warning">고의로 허위 내용을 보내 공공기관의 업무를 방해하면 사안에 따라 <a href="https://www.law.go.kr/LSW/precInfoP.do?precSeq=238313" target="_blank" rel="noreferrer">거짓신고</a> 또는 <a href="https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0137&lsiSeq=290185&urlMode=lsScJoRltInfoR" target="_blank" rel="noreferrer">위계에 의한 공무집행방해죄</a> 등으로 처벌될 수 있습니다. 꼭 필요한 순간, 사실에 근거해 이용해 주세요.</p><p className="emergency-official-help">즉각적인 위험은 경찰 <strong>112</strong> · 화재·구급 <strong>119</strong>로 먼저 연락해 주세요.<br/>운영자의 확인과 연락 지원에는 시간이 걸릴 수 있습니다.</p>{isDemoAccount&&<p className="emergency-current-test">요청 미리보기 화면입니다. 신고 접수나 공공기관 연락은 이루어지지 않습니다.</p>}<button className="emergency-help-button" onClick={()=>{if(!authenticated){onRequireAuth?.(()=>setFormOpen(true));return;}setFormOpen(true);}}>도움요청하기<ArrowUpRight size={21}/></button></div>
    {formOpen&&authenticated&&<Modal title="긴급 도움 요청" close={()=>setFormOpen(false)} wide><EmergencyForm isDemoAccount={isDemoAccount} keepsDemoRequest={!!onTestRequest} enabled={enabled} connectionNote={connectionNote} gateway={gateway} onTestSubmitted={draft=>{onTestRequest?.(draft);setFormOpen(false);setTestComplete(true);}} onSubmitted={id=>{setFormOpen(false);setReceipt(id);}}/></Modal>}
    {testComplete&&<Modal title="긴급 요청 미리보기" close={()=>setTestComplete(false)}><div className="emergency-receipt"><CheckCircle2 size={44}/><h2>작성과 동의를 마쳤습니다.</h2><p><strong>운영자에게 전송된 요청은 없습니다.</strong><br/>{onTestRequest?'이 탭의 요청 예시 보관함에서 내용을 확인할 수 있습니다. 새로고침·로그아웃 시 삭제됩니다.':'입력 내용은 저장하지 않았으며 다른 회원에게 공개되지 않습니다.'}</p><p>실제 도움 요청 접수는 회원·문의 서버 연결 후 이용할 수 있습니다. 즉각적인 위험은 112·119로 연락해 주세요.</p>{onOpenTestInbox&&<button className="button button-dark" onClick={()=>{setTestComplete(false);onOpenTestInbox();}}>요청 예시 보기<ShieldCheck size={17}/></button>}<button className={`button ${onOpenTestInbox?'button-light':'button-dark'}`} onClick={()=>setTestComplete(false)}>확인<Check size={17}/></button></div></Modal>}
    {receipt&&<Modal title="도움 요청 접수" close={()=>setReceipt(null)}><div className="emergency-receipt"><CheckCircle2 size={44}/><h2>도움 요청이 접수되었습니다.</h2><p>운영자만 볼 수 있는 비공개 요청함에 등록했습니다. 다른 회원에게는 내용이나 접수 목록이 공개되지 않습니다.</p><span>접수 번호</span><code>{receipt}</code><p>운영자가 내용을 확인한 뒤 입력한 연락처로 연락드립니다. 즉각적인 위험은 112·119로 먼저 연락해 주세요.</p><button className="button button-dark" onClick={()=>setReceipt(null)}>확인<Check size={17}/></button></div></Modal>}
  </section>);
}

function EmergencyForm({isDemoAccount,keepsDemoRequest,enabled,connectionNote,gateway,onTestSubmitted,onSubmitted}:{isDemoAccount:boolean;keepsDemoRequest:boolean;enabled:boolean;connectionNote:string;gateway:EmergencyGateway;onTestSubmitted:(draft:EmergencyDraft)=>void;onSubmitted:(id:string)=>void}) {
  const localize=useLocalized();
  const id=useId(),requestId=useRef(crypto.randomUUID());
  const noticeId=`${id}-privacy-notice`;
  const [policy,setPolicy]=useState<LegalKind|null>(null);
  const policyRef=useRef<HTMLDivElement>(null),errorRef=useRef<HTMLParagraphElement>(null);
  const [draft,setDraft]=useState<EmergencyDraft>({name:'',phone:'',email:'',location:'',body:'',consent:false,consentVersion:EMERGENCY_CONSENT_VERSION});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const change=(field:keyof EmergencyDraft,value:string|boolean)=>{setDraft(old=>({...old,[field]:value}));setError('');};
  useEffect(()=>{if(!policy)return;policyRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});policyRef.current?.focus({preventScroll:true});},[policy]);
  useEffect(()=>{if(!error)return;errorRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});errorRef.current?.focus({preventScroll:true});},[error]);
  const closePolicy=()=>{const previous=policy;setPolicy(null);document.getElementById(`${noticeId}-${previous}-link`)?.focus({preventScroll:true});};
  return localize(<form className="standard-form emergency-form" autoComplete="off" onSubmit={async event=>{
    event.preventDefault();if(busy)return;setError('');
    try{validateEmergencyDraft(draft);}catch(e){setError(errorMessage(e));return;}
    if(isDemoAccount){const submitted={...draft};setDraft({name:'',phone:'',email:'',location:'',body:'',consent:false,consentVersion:EMERGENCY_CONSENT_VERSION});onTestSubmitted(submitted);return;}
    setBusy(true);
    try{const result=await gateway.submit(draft,requestId.current);setDraft({name:'',phone:'',email:'',location:'',body:'',consent:false,consentVersion:EMERGENCY_CONSENT_VERSION});onSubmitted(result.id);}
    catch(e){setError(errorMessage(e));setBusy(false);}
  }}>
    <div className="emergency-form-privacy"><LockKeyhole size={19}/><p>{isDemoAccount?(keepsDemoRequest?'요청 예시은 이 탭에서만 임시로 보관하며 실제 운영자에게 전달하지 않습니다.':'미리보기에서는 입력 내용을 저장하거나 운영자에게 전달하지 않습니다.'):'운영자만 확인하는 비공개 요청입니다. 공개 게시판에는 표시되지 않습니다.'}</p></div>
    {!enabled&&<p className="emergency-unavailable" role="status"><strong>{isDemoAccount?'요청 작성 미리보기입니다. 실제 개인정보를 입력하지 마세요.':'현재 실제 전송은 비활성화되어 있습니다.'}</strong>{isDemoAccount?'이름·연락처 등은 예시로 입력해 주세요. 동의 후 미리보기 완료 화면을 확인할 수 있으며 실제 접수는 되지 않습니다.':connectionNote}<br/>{keepsDemoRequest?'요청 예시 보관함의 내용은 새로고침·로그아웃 시 삭제됩니다.':'이 양식은 브라우저에 저장되지 않습니다.'}</p>}
    <div className="emergency-form-grid"><label htmlFor={`${id}-name`}>이름<input id={`${id}-name`} value={draft.name} onChange={e=>change('name',e.target.value)} maxLength={80} required placeholder="연락받을 이름" disabled={busy}/></label><label htmlFor={`${id}-phone`}>연락처<input id={`${id}-phone`} type="tel" inputMode="tel" value={draft.phone} onChange={e=>change('phone',e.target.value)} maxLength={40} required placeholder="국가번호 포함, 예: +82 10 1234 5678" disabled={busy}/></label></div>
    <label htmlFor={`${id}-email`}>메일주소<input id={`${id}-email`} type="email" value={draft.email} onChange={e=>change('email',e.target.value)} maxLength={254} required placeholder="연락 가능한 이메일 주소" disabled={busy}/></label>
    <label htmlFor={`${id}-location`}>현위치<input id={`${id}-location`} value={draft.location} onChange={e=>change('location',e.target.value)} minLength={2} maxLength={500} required placeholder="예: 서울역 1번 출구, 가까운 건물명·층" disabled={busy}/></label><p className="emergency-location-note"><MapPin size={14}/>위치는 직접 입력하며 GPS를 자동으로 수집하지 않습니다.</p>
    <label htmlFor={`${id}-body`}>요청 내용<textarea id={`${id}-body`} value={draft.body} onChange={e=>change('body',e.target.value)} minLength={10} maxLength={5000} rows={7} required placeholder="베트남어로 현재 상황과 필요한 도움을 구체적으로 적어 주세요." disabled={busy}/></label><p className="privacy-note">주민등록번호·여권번호·건강정보·카드번호 등 민감한 정보는 입력하지 마세요.</p>
    <EmergencyPrivacyNotice noticeId={noticeId} onViewPolicy={kind=>setPolicy(current=>current===kind?null:kind)} policyView={policy} disabled={busy}/>
    {policy&&<div ref={policyRef} className="emergency-policy-document" id={`${noticeId}-document`} tabIndex={-1} role="region" aria-label={legalTitle(policy)}><div className="emergency-policy-heading"><h3>{legalTitle(policy)}</h3><button type="button" className="icon-button" aria-label="약관 닫기" onClick={closePolicy}><X size={19}/></button></div><LegalDocument kind={policy}/><button type="button" className="button button-light" onClick={closePolicy}>작성 중인 요청으로 돌아가기</button></div>}
    <label className="emergency-consent" htmlFor={`${id}-consent`}><input id={`${id}-consent`} type="checkbox" checked={draft.consent} onChange={e=>change('consent',e.target.checked)} disabled={busy} required aria-describedby={noticeId}/><span>개인정보 수집·이용에 동의합니다. <strong>(필수)</strong></span></label>
    {error&&<p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>{error}</p>}
    <button className="button emergency-send full-width" disabled={!draft.consent||busy}>{busy?'전송 중':isDemoAccount?'작성 내용 확인':'메세지보내기'}<ArrowUpRight size={18}/></button>
  </form>);
}

export function EmergencyAdmin({isDemoAccount,gateway:providedGateway,onHome}:{isDemoAccount:boolean;gateway?:EmergencyGateway;onHome:()=>void}) {
  const localize=useLocalized();
  const gateway=useMemo(()=>providedGateway??emergencyGateway(),[providedGateway]);
  const [rows,setRows]=useState<EmergencySummary[]>([]),[filter,setFilter]=useState<'all'|EmergencyState>('all');
  const [loading,setLoading]=useState(true),[allowed,setAllowed]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [record,setRecord]=useState<EmergencyRecord|null>(null),[busy,setBusy]=useState(false),[recordError,setRecordError]=useState('');
  const request=useRef(0);
  useEffect(()=>{
    let active=true;setLoading(true);setBusy(false);setError('');setRecordError('');setRecord(null);request.current++;
    if(isDemoAccount){setAllowed(false);setLoading(false);return;}
    gateway.access().then(async access=>{if(!access.isAdmin)throw new Error('운영자 권한이 필요합니다.');const data=await gateway.list(filter);if(active){setAllowed(true);setRows(data);}}).catch(e=>{if(active){setAllowed(false);setRows([]);setRecord(null);setError(errorMessage(e));}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;request.current++;};
  },[gateway,isDemoAccount,filter,revision]);
  if(loading)return localize(<section className="shell section page-section"><p role="status">운영자 권한을 확인하고 있습니다.</p></section>);
  if(!allowed)return localize(<section className="shell section page-section"><EmptyState title="운영자 전용 게시판입니다." text={error||'운영자만 접수 목록과 내용을 확인할 수 있습니다.'} action="홈으로 돌아가기" onAction={onHome}/></section>);
  return localize(<section className="shell section page-section emergency-admin"><div className="page-heading"><div><p className="eyebrow"><ShieldCheck size={15}/>운영자 전용 · 외부 공개 안 됨</p><h1>긴급 요청함.</h1><p>도움 요청의 개인정보는 운영자만 확인할 수 있습니다.</p></div><button className="text-link" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/>새로고침</button></div><div className="tabs" aria-label="긴급 요청 상태">{[['all','전체'],['new','접수'],['viewed','확인 중'],['resolved','처리 완료']].map(([value,label])=><button key={value} className={filter===value?'selected':''} aria-pressed={filter===value} onClick={()=>setFilter(value as typeof filter)}>{label}</button>)}</div><p className="sample-note">최근 50건 · 기한이 지난 요청은 조회하지 않습니다.</p>{rows.length?<div className="emergency-admin-list">{rows.map(row=><button key={row.id} className="emergency-admin-row" disabled={busy} onClick={async()=>{const token=++request.current;setBusy(true);setRecordError('');try{const data=await gateway.open(row.id);if(request.current===token){setRecord(data);setRows(old=>old.map(row=>row.id===data.id?{...row,status:data.status}:row));}}catch(e){if(request.current===token)setError(errorMessage(e));}finally{if(request.current===token)setBusy(false);}}}><span className={`support-status ${row.status==='resolved'?'answered':''}`}>{row.status==='new'?'접수':row.status==='viewed'?'확인 중':'처리 완료'}</span><strong translate="no">{row.name}</strong><time>{dateLabel(row.createdAt)}</time><ArrowUpRight size={18}/></button>)}</div>:<EmptyState title="해당하는 요청이 없습니다." text="비공개 도움 요청이 접수되면 이곳에 표시됩니다."/>}{error&&<p className="form-error" role="alert">{error}</p>}
    {record&&<Modal title="비공개 긴급 요청" close={()=>{request.current++;setRecord(null);setBusy(false);setRecordError('');}} wide><article className="emergency-admin-detail"><p className="eyebrow">접수 {dateLabel(record.createdAt)}</p><h2>{record.name}님의 도움 요청</h2><dl>{[['연락처',record.phone],['메일주소',record.email],['현위치',record.location]].map(([label,value])=><div key={label}><dt>{label}</dt><dd translate="no">{value}</dd></div>)}</dl><h3>요청 내용</h3><p className="emergency-request-body" translate="no">{record.body}</p><div className="emergency-record-consent"><strong>개인정보 수집·이용 동의 기록</strong><span>{dateLabel(record.consentedAt)} · {record.consentVersion}</span><span>최종 보관 기한: {new Date(record.expiresAt).toLocaleDateString('ko-KR')}</span></div>{record.status==='resolved'?<p className="support-status answered">처리 완료</p>:<button className="button button-dark" disabled={busy} onClick={async()=>{const token=++request.current;setBusy(true);setRecordError('');try{await gateway.resolve(record.id);const next=await gateway.open(record.id);if(request.current===token){setRecord(next);setRows(old=>old.map(row=>row.id===next.id?{...row,status:next.status}:row).filter(row=>filter==='all'||row.status===filter));}}catch(e){if(request.current===token)setRecordError(errorMessage(e));}finally{if(request.current===token)setBusy(false);}}}>처리 완료로 표시<Check size={17}/></button>}{recordError&&<p className="form-error" role="alert">{recordError}</p>}</article></Modal>}
  </section>);
}
