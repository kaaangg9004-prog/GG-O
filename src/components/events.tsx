'use client';

import {useDetailRoute} from './use-detail-route';
import {ArrowLeft,ArrowUpRight} from 'lucide-react';
import {useId,useRef,useState} from 'react';
import {CalendarDays,Check,ImagePlus,MapPin,Pencil,Plus,ThumbsDown,ThumbsUp,Trash2,X} from 'lucide-react';
import {useLocalized} from './locale-provider';
import {EmptyState,Modal} from './ui';
import {getSupabase} from '@/lib/supabase-service';
import {eventStatuses} from '@/lib/types';
import type {CommunityEvent} from '@/lib/types';
import {EVENT_PLACEHOLDER,parseEvent} from '@/lib/event-catalog';
import {readProductPhoto} from '@/lib/product-images';
import {isPresetEventText} from '@/lib/localized-content';

type EventActions={onSave:(event:CommunityEvent)=>boolean|Promise<boolean>;onDelete:(id:string)=>boolean|Promise<boolean>;onReact:(id:string,reaction:'like'|'dislike')=>void};
export function EventsPage({events,reactions,canManage,onSave,onDelete,onReact}:{events:CommunityEvent[];reactions:Record<string,'like'|'dislike'>;canManage:boolean}&EventActions) {
  const localize=useLocalized();
  const [selectedId,open]=useDetailRoute('events');
  const selected=events.find(e=>e.id===selectedId);
  const [editing,setEditing]=useState<CommunityEvent|null|undefined>(undefined),[deleting,setDeleting]=useState<CommunityEvent|null>(null);
  return localize(<section className="shell section page-section events-page">
    {selectedId?selected?<article className="story-detail"><button className="back-link" onClick={()=>open(null)}><ArrowLeft size={17}/>이벤트 목록</button><div className="story-heading"><p className="eyebrow">{selected.label} · {selected.status}</p><h1>{selected.title}</h1></div><img className="story-cover" src={selected.image} alt="이벤트 대표 이미지"/><div className="event-facts"><p><CalendarDays size={18}/>{selected.schedule||localize.text('일정 미정')}</p><p><MapPin size={18}/>{selected.location}</p></div><div className="story-copy">{selected.description.split('\n').filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div>        <div className="event-reactions" aria-label={`${selected.title} 반응`}><button className={reactions[selected.id]==='like'?'is-selected reaction-like':''} aria-pressed={reactions[selected.id]==='like'} aria-label={`${selected.title} 좋아요`} onClick={()=>onReact(selected.id,'like')}><ThumbsUp size={18}/>좋아요</button><button className={reactions[selected.id]==='dislike'?'is-selected reaction-dislike':''} aria-pressed={reactions[selected.id]==='dislike'} aria-label={`${selected.title} 싫어요`} onClick={()=>onReact(selected.id,'dislike')}><ThumbsDown size={18}/>싫어요</button></div>
        <p className="event-reaction-status">{reactions[selected.id]?`내 반응: ${reactions[selected.id]==='like'?'좋아요':'싫어요'}`:'관심 있는 기획안에 반응을 남겨 주세요.'}</p>
</article>:<EmptyState title="이벤트를 찾을 수 없습니다." text="삭제되었거나 주소가 변경된 이벤트입니다." action="이벤트 목록" onAction={()=>open(null)}/>:<><div className="page-heading"><div><p className="eyebrow">취향이 경험이 되는 순간</p><h1>함께할 만남</h1><p>기획 중인 만남을 살펴보세요. 일정과 참가 안내는 확정 후 공개합니다.</p></div>{canManage&&<button className="button button-dark" onClick={()=>setEditing(null)}><Plus size={18}/>이벤트 등록</button>}</div>
    {canManage&&<div className="catalog-notice event-management-notice"><strong>이벤트 관리</strong><p>{getSupabase()?'변경 사항은 서버에 저장되며 모든 기기에 공유됩니다.':'변경 사항은 현재 브라우저에 저장됩니다.'}</p></div>}
    {events.length?<div className="event-grid">{events.map(event=><article className="event-card" key={event.id}>
      <button className="event-image event-cover-button" aria-label={event.title+" 상세정보"} onClick={()=>open(event.id)}><img src={event.image} alt="이벤트 대표 이미지" loading="lazy"/><span className="product-tag tag-lime">{event.status}</span></button>
      <div className="event-body"><p className="eyebrow" translate={isPresetEventText(event,event.label)?'yes':'no'}>{event.label}</p><h2><button className="event-title-link" translate={isPresetEventText(event,event.title)?'yes':'no'} onClick={()=>open(event.id)}>{event.title}</button></h2><p className="event-description" translate={isPresetEventText(event,event.description)?'yes':'no'}>{event.description}</p>
        {<span className="event-location"><CalendarDays size={16}/><span translate="no">{event.schedule||localize.text('일정 미정')}</span></span>}
        <span className="event-location"><MapPin size={16}/><span translate={isPresetEventText(event,event.location)?'yes':'no'}>{event.location}</span></span>
        <button className="text-link" onClick={()=>open(event.id)}>상세정보 읽기<ArrowUpRight size={17}/></button>
        {canManage&&<div className="event-management-actions"><button onClick={()=>setEditing(event)} aria-label={`${event.title} 편집`}><Pencil size={15}/>편집</button><button className="danger" onClick={()=>setDeleting(event)} aria-label={`${event.title} 삭제`}><Trash2 size={15}/>삭제</button></div>}
      </div>
    </article>)}</div>:<EmptyState title="아직 등록된 이벤트가 없어요." text="새로운 만남과 경험을 준비하고 있습니다." action={canManage?'이벤트 등록':undefined} onAction={()=>setEditing(null)}/>}
    </>}<p className="sample-note">이벤트를 둘러보고 반응을 남길 수 있습니다. 참가 신청과 결제는 준비 중입니다.</p>
    {editing!==undefined&&canManage&&<Modal title={editing?'이벤트 편집':'이벤트 등록'} close={()=>setEditing(undefined)} wide><EventEditor key={editing?.id??'new-event'} event={editing??undefined} onCancel={()=>setEditing(undefined)} onSave={event=>{const finish=(saved:boolean)=>{if(saved)setEditing(undefined);return saved;};const saved=onSave(event);return saved instanceof Promise?saved.then(finish):finish(saved);}}/></Modal>}
    {deleting&&canManage&&<Modal title="이벤트 삭제" close={()=>setDeleting(null)}><div className="product-delete-confirm"><h3>이 이벤트를 삭제할까요?</h3><p translate={isPresetEventText(deleting,deleting.title)?'yes':'no'}>{deleting.title}</p><p>이벤트가 목록에서 삭제됩니다.</p><div><button className="button button-light" onClick={()=>setDeleting(null)}>취소</button><button className="button button-dark" onClick={async()=>{if(await onDelete(deleting.id))setDeleting(null);}}>삭제하기</button></div></div></Modal>}
  </section>);
}

export function EventEditor({event,onSave,onCancel}:{event?:CommunityEvent;onSave:(event:CommunityEvent)=>boolean|Promise<boolean>;onCancel:()=>void}) {
  const localize=useLocalized(),id=useId(),eventId=useRef(event?.id??`event-${crypto.randomUUID()}`);
  const [title,setTitle]=useState(event?.title??''),[label,setLabel]=useState(event?.label??''),[description,setDescription]=useState(event?.description??'');
  const [location,setLocation]=useState(event?.location??''),[schedule,setSchedule]=useState(event?.schedule??''),[status,setStatus]=useState<CommunityEvent['status']>(event?.status??'기획 중');
  const [image,setImage]=useState(event?.image??EVENT_PLACEHOLDER),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const upload=async(file?:File)=>{if(!file)return;setBusy(true);setError('');try{setImage(await readProductPhoto(file));}catch(error){setError(error instanceof Error?error.message:'사진을 등록하지 못했습니다.');}finally{setBusy(false);}};
  return localize(<form className="standard-form event-editor" onSubmit={submit=>{
    submit.preventDefault();if(busy)return;setError('');const result=parseEvent({id:eventId.current,title,label,description,location,schedule,status,image});
    if(!result){setError('이벤트 제목·분류·소개·장소·진행 상태와 이미지를 확인해 주세요.');return;}
    const finish=(saved:boolean)=>{setBusy(false);if(!saved)setError('저장하지 못했습니다. 안내 메시지와 브라우저 저장 공간을 확인해 주세요.');};const saved=onSave(result);if(saved instanceof Promise){setBusy(true);void saved.then(finish).catch(()=>finish(false));}else finish(saved);
  }}>
    <div className="event-editor-layout"><div className="event-editor-fields">
      <section className="editor-section"><h3>이벤트 정보</h3>
        <label htmlFor={`${id}-title`}>이벤트 제목 *<input id={`${id}-title`} value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={100} required placeholder="예: 하노이에서, 같이 가자!"/></label>
        <div className="editor-grid"><label htmlFor={`${id}-label`}>이벤트 분류 *<input id={`${id}-label`} value={label} onChange={e=>setLabel(e.target.value)} minLength={2} maxLength={60} required placeholder="예: 커뮤니티 만남"/></label><label htmlFor={`${id}-status`}>진행 상태<select id={`${id}-status`} value={status} onChange={e=>setStatus(e.target.value as CommunityEvent['status'])}>{eventStatuses.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
        <label htmlFor={`${id}-description`}>이벤트 소개 *<textarea id={`${id}-description`} value={description} onChange={e=>setDescription(e.target.value)} minLength={3} maxLength={3000} rows={6} required placeholder="어떤 만남인지, 무엇을 함께할지 소개해 주세요."/></label>
        <label htmlFor={`${id}-location`}>장소 *<input id={`${id}-location`} value={location} onChange={e=>setLocation(e.target.value)} minLength={2} maxLength={200} required placeholder="예: 하노이 · 장소 추후 안내"/></label>
        <label htmlFor={`${id}-schedule`}>일정 (선택)<input id={`${id}-schedule`} value={schedule} onChange={e=>setSchedule(e.target.value)} maxLength={200} placeholder="예: 12월 7일 오후 2시 / 일정 미정"/></label>
      </section>
      <section className="editor-section"><h3>대표 이미지</h3><label className="upload-button"><ImagePlus size={18}/><span>{busy?'사진 처리 중':'대표 사진 선택'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label><p className="editor-help">사진은 용량을 줄여 저장합니다. 원본은 12MB 이하로 선택해 주세요.</p>
        <div className="event-photo-options" aria-label="기본 이벤트 사진 선택">{[['cafe','카페 사진 선택'],['friends','모임 사진 선택'],['concert','공연 사진 선택']].map(([name,caption])=><button type="button" key={name} disabled={busy} aria-label={caption} aria-pressed={image===`/images/${name}.jpg`} onClick={()=>setImage(`/images/${name}.jpg`)}><img src={`/images/${name}.jpg`} alt=""/></button>)}</div>
        {image!==EVENT_PLACEHOLDER&&<button type="button" className="text-link" disabled={busy} onClick={()=>setImage(EVENT_PLACEHOLDER)}>대표 이미지 지우기<X size={14}/></button>}
      </section>
    </div><aside className="event-editor-preview"><h3>이벤트 카드 미리보기</h3><div className="event-card"><div className="event-image"><img src={image} alt="이벤트 대표 이미지 미리보기"/><span className="product-tag tag-lime">{status}</span></div><div className="event-body"><p className="eyebrow" translate={label?'no':'yes'}>{label||'이벤트 분류'}</p><h2 translate={title?'no':'yes'}>{title||'이벤트 제목'}</h2><p className="event-description" translate={description?'no':'yes'}>{description||'이벤트 소개를 입력하면 여기에 표시됩니다.'}</p>{schedule&&<span className="event-location"><CalendarDays size={16}/><span translate="no">{schedule}</span></span>}<span className="event-location"><MapPin size={16}/><span translate={location?'no':'yes'}>{location||'장소를 입력해 주세요.'}</span></span></div></div></aside></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="product-editor-actions"><button type="button" className="button button-light" onClick={onCancel}>취소</button><button className="button button-dark" disabled={busy}>{busy?'사진 처리 중':event?'수정 내용 저장':'이벤트 등록하기'}<Check size={18}/></button></div>
  </form>);
}
