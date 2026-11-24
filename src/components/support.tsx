'use client';


import {useLocalized} from '@/components/locale-provider';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Check,ChevronRight,LifeBuoy,LockKeyhole,MessageSquare,Plus,RefreshCw,ShieldCheck,UserRound} from 'lucide-react';
import {dateLabel,money} from '@/lib/data';
import {demoSupportGateway} from '@/lib/support-demo';
import {serverSupportGateway} from '@/lib/support-service';
import {supportCategories} from '@/lib/support-types';
import type {SupportCategory,SupportConversation,SupportDraft,SupportGateway,SupportMember,SupportTicket} from '@/lib/support-types';
import {EmptyState,Modal} from './ui';

const message=(error:unknown)=>error instanceof Error?error.message:'처리하지 못했습니다. 다시 시도해 주세요.';
const queues = [
  ['waiting','새로운 문의','새로운 문의가 없습니다.'],
  ['in_progress','답변 중','답변 중인 문의가 없습니다.'],
  ['answered','답변 완료','답변 완료된 문의가 없습니다.'],
] as const;
const statusLabel = (status:SupportTicket['status']) => queues.find(([key])=>key===status)?.[1];

export function SupportBoard({isDemoAccount,member,gateway:injectedGateway}:{isDemoAccount:boolean;member:()=>SupportMember;gateway?:SupportGateway}) {
  const localize=useLocalized();
  const memberRef=useRef(member);memberRef.current=member;
  const gateway=useMemo(()=>injectedGateway??(isDemoAccount?demoSupportGateway(()=>memberRef.current()):serverSupportGateway()),[injectedGateway,isDemoAccount]);
  const [tickets,setTickets]=useState<SupportTicket[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [serverAdmin,setServerAdmin]=useState(false),[revision,setRevision]=useState(0);
  const [composing,setComposing]=useState(false),[selected,setSelected]=useState<SupportTicket|null>(null);
  const [conversation,setConversation]=useState<SupportConversation|null>(null),[profile,setProfile]=useState<SupportMember|null>(null);
  const [password,setPassword]=useState(''),[detailError,setDetailError]=useState(''),[busy,setBusy]=useState(false),[showMember,setShowMember]=useState(false);
  const [reply,setReply]=useState('');
  const [ticketStatus,setTicketStatus]=useState<SupportTicket['status']>('waiting');
  const request=useRef(0),isAdmin=serverAdmin;
  const visibleTickets=isAdmin?tickets.filter(ticket=>ticket.status===ticketStatus):tickets;

  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    gateway.access().then(async access=>{
      const all=access.isAdmin,rows=await gateway.list(all);
      if(active){setServerAdmin(access.isAdmin);setTickets(rows);}
    }).catch(e=>{if(active){setError(message(e));setTickets([]);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[gateway,isDemoAccount,revision]);

  const close=()=>{request.current++;setSelected(null);setConversation(null);setProfile(null);setPassword('');setReply('');setDetailError('');setBusy(false);setShowMember(false);};
  const loadProfile=async(ticket:SupportTicket,token:number)=>{
    const data=await gateway.member(ticket.ownerId,ticket.id,isAdmin);
    if(request.current===token)setProfile(data);
  };
  const unlock=async(ticket:SupportTicket,secret:string,memberFirst=false)=>{
    const token=++request.current;setBusy(true);setDetailError('');
    try {
      const data=await gateway.open(ticket.id,secret,isAdmin);
      if(request.current!==token)return;
      setConversation(data);setPassword('');
      if(memberFirst){setShowMember(true);await loadProfile(ticket,token);}
    }catch(e){if(request.current===token)setDetailError(message(e));}
    finally{if(request.current===token)setBusy(false);}
  };
  const select=(ticket:SupportTicket,memberFirst=false)=>{
    close();setSelected(ticket);setShowMember(memberFirst);
    if(isAdmin)void unlock(ticket,'',memberFirst);
  };
  const markStatus=(id:string,status:SupportTicket['status'])=>{
    setTickets(current=>current.map(ticket=>ticket.id===id?{...ticket,status}:ticket));
    setConversation(current=>current?.ticket.id===id?{...current,ticket:{...current.ticket,status}}:current);
    setRevision(n=>n+1);
  };
  const complete=async(ticket:SupportTicket)=>{
    const token=++request.current;
    setBusy(true);setDetailError('');
    try {
      await gateway.complete(ticket.id);
      markStatus(ticket.id,'answered');
    }catch(e){if(request.current===token)setDetailError(message(e));}
    finally{if(request.current===token)setBusy(false);}
  };

  return localize(<section className="shell section page-section support-page">
    <div className="page-heading"><div><p className="eyebrow">궁금한 점을 남겨 주세요</p><h1>고객지원.</h1><p>내 문의와 운영자의 답변을 한곳에서 확인하세요.</p></div><button className="button button-dark" onClick={()=>setComposing(true)}><Plus size={18}/>문의 작성</button></div>
    <div className={`support-notice ${isDemoAccount?'support-demo-notice':''}`}><LifeBuoy size={23}/><div><strong>{isDemoAccount?'고객지원 미리보기 · 실제 개인정보를 입력하지 마세요.':'나와 운영자만 확인하는 비공개 문의'}</strong><p>{isDemoAccount?'문의와 답변은 이 브라우저에만 저장됩니다. 비밀번호 확인과 운영자 화면을 미리 볼 수 있으며, 실제 회원 보호·공용 문의 수신은 서버 연결 후 활성화됩니다.':'일반 회원은 본인 문의만 글 비밀번호로 열 수 있습니다. 운영자는 권한 확인 후 전체 문의와 회원 정보를 확인합니다.'}</p></div></div>
    <div className="support-toolbar"><div><strong>{isAdmin?'전체 문의':'내 문의'}</strong><span>{tickets.length}건</span>{isAdmin&&<span className="support-role"><ShieldCheck size={14}/>{isDemoAccount?'운영 화면 미리보기':'운영자'}</span>}</div><div><button className="text-link" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15}/>새로고침</button></div></div>
    {isAdmin&&<div className="board-admin-prefix" role="group" aria-label="문의 상태">
      {queues.map(([status,label])=><button key={status} type="button" className={`button ${ticketStatus===status?'button-dark':'button-light'}`}
        aria-pressed={ticketStatus===status} onClick={()=>setTicketStatus(status)}>{label} <span>{tickets.filter(ticket=>ticket.status===status).length}</span></button>)}
    </div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading?<p className="support-loading" role="status">문의를 불러오고 있어요.</p>:visibleTickets.length?<div className="support-ticket-list">{visibleTickets.map(ticket=><article className="support-ticket-row" key={ticket.id}><span className={`support-status ${ticket.status==='answered'?'answered':''}`}>{statusLabel(ticket.status)}</span><div><span className="support-category">{ticket.category}</span><button className="support-ticket-title" translate="no" onClick={()=>select(ticket)}><LockKeyhole size={16}/>{ticket.title}<ChevronRight size={17}/></button><div className="support-ticket-meta"><button className="support-member-id" onClick={()=>select(ticket,true)} aria-label={`${ticket.authorId} 회원 정보`}><UserRound size={12}/><span translate="no">{ticket.authorId}</span></button><time dateTime={ticket.createdAt}>{dateLabel(ticket.createdAt)}</time></div></div></article>)}</div>:!error&&(isAdmin?<p className="support-loading">{queues.find(([status])=>ticketStatus===status)?.[2]}</p>:<EmptyState title="아직 문의가 없어요." text="궁금한 내용을 남기면 이곳에서 답변을 확인할 수 있습니다." action="문의 작성" onAction={()=>setComposing(true)}/>)}
    <div className="support-guidance"><LockKeyhole size={19}/><p>고객지원에서는 로그인 아이디를 표시합니다. 커뮤니티의 익명 표시는 그대로 유지됩니다.{isDemoAccount&&' 미리보기에는 관리자 권한이 부여되지 않습니다.'}</p></div>

    {composing&&<Modal title="고객지원 문의 작성" close={()=>setComposing(false)} wide><SupportComposer authorId={memberRef.current().handle} demo={isDemoAccount} onCancel={()=>setComposing(false)} onCreate={async draft=>{await gateway.create(draft);setComposing(false);setRevision(n=>n+1);}}/></Modal>}
    {selected&&<Modal title={profile?'회원 정보':'고객지원 문의'} close={close} wide>
      {!conversation?<form className="standard-form support-unlock" onSubmit={e=>{e.preventDefault();void unlock(selected,password,showMember);}}><span className="support-lock-icon"><LockKeyhole size={27}/></span><p className="eyebrow">비공개 문의</p><h2 translate="no">{selected.title}</h2><p>{isAdmin?'운영자 권한으로 문의를 불러오고 있습니다.':'작성할 때 설정한 글 비밀번호를 입력해 주세요.'}</p>{!isAdmin&&<label>글 비밀번호<input type="password" autoComplete="off" value={password} onChange={e=>{setPassword(e.target.value);setDetailError('');}} maxLength={72} required autoFocus/></label>}{detailError&&<p className="form-error" role="alert">{detailError}</p>}<button className="button button-dark" disabled={busy||(!isAdmin&&!password)}>{busy?'확인 중':'문의 확인'}<ArrowUpRight size={17}/></button></form>
      :profile?<div className="support-member-profile"><button className="back-link" onClick={()=>{setProfile(null);setShowMember(false);setDetailError('');}}><ArrowLeft size={16}/>문의로 돌아가기</button><p className="eyebrow">{profile.demo?'예시 회원 정보':'회원 정보'}</p><h2><UserRound size={25}/><span translate="no">{profile.handle}</span></h2><dl><div><dt>{profile.demo?'미리보기 시작일':'가입일자'}</dt><dd>{new Date(profile.joinedAt).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'})}</dd></div></dl><h3>{profile.demo?'예시 구매 내역':'구매 상품'}</h3>{profile.orders.length?<div className="support-member-orders">{profile.orders.map(order=><article key={order.id}><div><strong translate="no">{order.id}</strong><time>{dateLabel(order.createdAt)}</time><span>{order.status==='demo'?'주문 예시 · 미결제':'구매 기록'}</span></div>{order.items.map((item,index)=><p key={index}>{item.productName??'상품'} · {item.variantLabel??item.variant} · {item.quantity}개</p>)}<strong>{money(order.subtotal)}</strong></article>)}</div>:<p className="support-no-orders">{profile.demo?'아직 주문 예시이 없습니다.':'구매 내역이 없습니다.'}</p>}{profile.demo&&<p className="privacy-note">실제 회원 가입일이나 결제 내역이 아닌 현재 기기의 예시 정보입니다.</p>}</div>
      :<article className="support-conversation"><div className="support-conversation-heading"><span className={`support-status ${conversation.ticket.status==='answered'?'answered':''}`}>{statusLabel(conversation.ticket.status)}</span><span className="support-category">{conversation.ticket.category}</span><h2 translate="no">{conversation.ticket.title}</h2><div className="support-ticket-meta"><button className="support-member-id" disabled={busy} aria-label={`${conversation.ticket.authorId} 회원 정보`} onClick={async()=>{const token=++request.current;setBusy(true);setDetailError('');try{await loadProfile(conversation.ticket,token);}catch(e){if(request.current===token)setDetailError(message(e));}finally{if(request.current===token)setBusy(false);}}}><UserRound size={14}/><span translate="no">{conversation.ticket.authorId}</span><ChevronRight size={13}/></button><time>{dateLabel(conversation.ticket.createdAt)}</time></div></div><p className="support-message-body" translate="no">{conversation.body}</p><section className="support-replies" aria-label="운영자 답변"><h3><MessageSquare size={19}/>운영자 답변</h3>{conversation.replies.length?conversation.replies.map(answer=><article className="support-answer" key={answer.id}><div><strong><ShieldCheck size={15}/><span translate="no">{answer.authorId}</span></strong><time>{dateLabel(answer.createdAt)}</time></div><p translate="no">{answer.body}</p></article>):<p className="support-no-answer">아직 답변이 등록되지 않았습니다.</p>}</section>{isAdmin&&conversation.ticket.status!=="answered"&&<form className="standard-form support-reply-form" onSubmit={async e=>{e.preventDefault();const token=++request.current;setBusy(true);setDetailError('');try{await gateway.reply(conversation.ticket.id,reply,true);markStatus(conversation.ticket.id,'in_progress');if(request.current===token){setReply('');const data=await gateway.open(conversation.ticket.id,'',true);if(request.current===token)setConversation(data);}}catch(e){if(request.current===token)setDetailError(message(e));}finally{if(request.current===token)setBusy(false);}}}><label>운영자 답변 작성<textarea value={reply} onChange={e=>setReply(e.target.value)} minLength={2} maxLength={5000} rows={5} required/></label><button className="button button-dark" disabled={busy||reply.trim().length<2}>{busy?'등록 중':'답변 등록'}<Check size={17}/></button></form>}{conversation.ticket.status==="in_progress"&&conversation.ticket.ownerId===member().id&&<button type="button" className="button button-dark" disabled={busy} onClick={()=>void complete(conversation.ticket)}>만족</button>}{detailError&&<p className="form-error" role="alert">{detailError}</p>}</article>}
    </Modal>}
  </section>);
}

function SupportComposer({authorId,demo,onCancel,onCreate}:{authorId:string;demo:boolean;onCancel:()=>void;onCreate:(draft:SupportDraft)=>Promise<void>}) {
  const localize=useLocalized();
  const [title,setTitle]=useState(''),[category,setCategory]=useState<SupportCategory>('일반 문의'),[body,setBody]=useState('');
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return localize(<form className="standard-form support-composer" onSubmit={async e=>{
    e.preventDefault();setError('');if(password!==confirm){setError('글 비밀번호와 확인이 일치하지 않습니다.');return;}
    setBusy(true);try{await onCreate({title,category,body,password});}catch(e){setError(message(e));setBusy(false);}
  }}><div className="support-writing-identity"><UserRound size={19}/><span>작성 아이디 <strong translate="no">{authorId}</strong></span><LockKeyhole size={16}/></div><label>문의 분류<select value={category} onChange={e=>setCategory(e.target.value as SupportCategory)}>{supportCategories.map(c=><option key={c}>{c}</option>)}</select></label><label>문의 제목<input value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={100} required/></label><label>문의 내용<textarea aria-label="문의 내용" value={body} onChange={e=>setBody(e.target.value)} minLength={10} maxLength={5000} rows={9} required/><small>{body.length.toLocaleString('ko-KR')} / 5,000자</small></label><div className="support-password-fields"><label>글 비밀번호<input aria-label="글 비밀번호" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} maxLength={72} required/><small>6자 이상 · 로그인 비밀번호와 다르게 설정해 주세요.</small></label><label>글 비밀번호 확인<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={6} maxLength={72} required/></label></div><p className="privacy-note">{demo?'이 브라우저에만 저장되는 예시 문의입니다. 실제 주문번호·주소·연락처 등 개인정보를 적지 마세요.':'비밀번호는 운영자에게 표시되지 않습니다. 카드번호·비밀번호 등 민감한 정보는 적지 마세요.'}</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="product-editor-actions"><button type="button" className="button button-light" disabled={busy} onClick={onCancel}>취소</button><button className="button button-dark" disabled={busy}>{busy?'문의 저장 중':'문의 등록'}<ArrowUpRight size={17}/></button></div></form>);
}
