'use client';
import {useEffect,useState,useMemo} from 'react';
import {ArrowLeft,ArrowUpRight,Plus,MessageSquare} from 'lucide-react';
import type {LocalState} from '@/lib/types';
import {listedNews,saveNews,commentNews,anonymousNewsComments,type NewsArticle} from '@/lib/news';
import {readProductPhoto} from '@/lib/product-images';
import {useLocalized} from './locale-provider';
import {useDetailRoute} from './use-detail-route';
import {editorialGateway,type SharedNews} from '@/lib/editorial-service';
import {EmptyState,Modal} from './ui';
export function NewsPage({state,canManage,actor,canWrite,mutate,onRequireAuth}:{state:LocalState;canManage:boolean;actor:string|null;canWrite:boolean;mutate:(fn:(s:LocalState)=>LocalState)=>boolean;onRequireAuth:()=>void}){
 const localize=useLocalized(),gateway=useMemo(()=>editorialGateway(),[]),[remote,setRemote]=useState<SharedNews[]>([]),[loading,setLoading]=useState(!!gateway),[saving,setSaving]=useState(false),[id,open]=useDetailRoute('news');
 const items:NewsArticle[]=gateway?remote.map(n=>({...n,comments:n.comments.map(c=>({...c,ownerKey:String(c.number)}))})):listedNews(state);
 const refresh=async()=>{if(gateway)setRemote(await gateway.news());};
 useEffect(()=>{if(!gateway)return;let active=true;const run=()=>gateway.news().then(n=>{if(active){setRemote(n);setLoading(false);}}).catch(()=>{if(active){setError('소식을 불러오지 못했습니다. 새로고침해 주세요.');setLoading(false);}});void run();window.addEventListener('focus',run);return()=>{active=false;window.removeEventListener('focus',run);};},[gateway,actor]);
 const perform=async(action:()=>Promise<void>)=>{if(saving)return false;setSaving(true);setError('');try{await action();await refresh();return true;}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');return false;}finally{setSaving(false);}};
 const [editing,setEditing]=useState<NewsArticle|null|undefined>(),[deleting,setDeleting]=useState<string|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setDraft('');setError('');},[id,actor]);
 const article=items.find(n=>n.id===id);
 const navigate=(next:string|null)=>{setDraft('');setError('');open(next);};
 const management=(n:NewsArticle)=><div className="event-management-actions"><button onClick={()=>setEditing(n)}>소식 편집</button><button onClick={()=>setDeleting(n.id)}>소식 삭제</button></div>;
 return localize(<section className="shell section page-section news-page">
 {loading?<p role="status">소식을 불러오는 중입니다.</p>:id?article?<article className="story-detail">
 <button className="back-link" onClick={()=>navigate(null)}><ArrowLeft size={17}/>소식 목록</button>
 <div className="story-heading"><p className="eyebrow" translate="no">{article.category} · GG-O</p><h1 translate="no">{article.title}</h1><p>운영자 · <time dateTime={article.createdAt}>{article.createdAt.slice(0,10)}</time></p></div>
 <img className="story-cover" src={article.image} alt="소식 대표 이미지"/>
 <div className="story-copy" translate="no">{article.body.split('\n').filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div>
 {canManage&&management(article)}
 <section className="news-comments" aria-label="소식 댓글"><h2><MessageSquare size={21}/>댓글 {article.comments.length}</h2>
 <p className="privacy-note">닉네임은 공개되지 않으며, 익명 번호는 이 소식 안에서만 유지됩니다.</p>
 {(gateway?remote.find(n=>n.id===article.id)?.comments??[]:anonymousNewsComments(article)).map(c=><div className="news-comment" key={c.id}><strong>익명 {c.number}</strong><time dateTime={c.createdAt}>{c.createdAt.slice(0,10)}</time><p translate="no">{c.text}</p>{canManage&&<button className="text-link" disabled={saving} onClick={()=>gateway?void perform(()=>gateway.deleteComment(c.id)):mutate(s=>({...s,newsEdits:[{...article,comments:article.comments.filter(v=>v.id!==c.id)},...s.newsEdits.filter(n=>n.id!==article.id)]}))}>댓글 삭제</button>}</div>)}
 {!article.comments.length&&<p>첫 댓글을 남겨 보세요.</p>}
 {actor?canWrite?<form className="standard-form" onSubmit={async e=>{e.preventDefault();if(!actor||!canWrite||saving)return;if(gateway?await perform(()=>gateway.comment(article.id,draft)):mutate(s=>commentNews(s,article.id,draft,actor))){setDraft('');setError('');}else setError('댓글을 저장하지 못했습니다.');}}><label>익명 댓글<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={3} maxLength={500} required/></label><button className="button button-dark" disabled={saving||!draft.trim()}>댓글 등록</button></form>:<p>댓글 작성이 잠시 중단되었습니다.</p>:<button className="button button-dark" onClick={onRequireAuth}>로그인 후 댓글 쓰기</button>}
 {error&&<p role="alert">{error}</p>}</section></article>:<EmptyState title="소식을 찾을 수 없습니다." text="삭제되었거나 주소가 변경된 소식입니다." action="소식 목록" onAction={()=>navigate(null)}/>:
 <><div className="page-heading"><div><p className="eyebrow">GG-O NEWSROOM</p><h1>소식</h1><p>운영자가 전하는 이야기, 함께 나누는 의견.</p></div>{canManage&&<button className="button button-dark" onClick={()=>setEditing(null)}><Plus size={18}/>소식 작성</button>}</div>
 <div className="event-grid news-grid">{items.map(n=><article className="event-card" key={n.id}><button className="story-card-open" onClick={()=>navigate(n.id)} aria-label={n.title}><div className="event-image"><img src={n.image} alt="" loading="lazy"/><span className="product-tag tag-lime" translate="no">{n.category}</span></div><div className="event-body"><span className="eyebrow">운영자 · {n.createdAt.slice(0,10)}</span><h2 translate="no">{n.title}</h2><p className="story-excerpt" translate="no">{n.body}</p><span className="story-card-bottom">댓글 {n.comments.length}<ArrowUpRight size={19}/></span></div></button>{canManage&&management(n)}</article>)}</div>
 {!items.length&&<EmptyState title="아직 등록된 소식이 없어요." text="새로운 소식을 준비하고 있습니다."/>}</>}
 <p className="sample-note">{gateway?'소식과 댓글은 서버에 저장됩니다. 댓글은 최대 100개까지 표시됩니다.':'소식과 댓글은 현재 브라우저에 저장됩니다.'}</p>{error&&<p role="alert">{error}</p>}
 {editing!==undefined&&canManage&&<Modal title={editing?'소식 편집':'소식 작성'} close={()=>setEditing(undefined)} wide><NewsEditor key={editing?.id??'new'} article={editing??undefined} onSave={async n=>{if(!canManage)return false;const saved=gateway?await perform(()=>gateway.save('news',n)):mutate(s=>saveNews(s,n,canManage));if(saved)setEditing(undefined);return saved;}}/></Modal>}
 {deleting&&canManage&&<Modal title="소식 삭제" close={()=>setDeleting(null)}><p>이 소식과 댓글을 목록에서 삭제할까요?</p><button className="button button-dark" disabled={saving} onClick={async()=>{if(!canManage)return;if(gateway?await perform(()=>gateway.remove('news',deleting)):mutate(s=>({...s,deletedNewsIds:[...new Set([...s.deletedNewsIds,deleting])]}))){setDeleting(null);navigate(null);}}}>삭제하기</button></Modal>}
 </section>);
}
function NewsEditor({article,onSave}:{article?:NewsArticle;onSave:(n:NewsArticle)=>boolean|Promise<boolean>}){
 const localize=useLocalized();
 const [title,setTitle]=useState(article?.title??''),[category,setCategory]=useState(article?.category??'GG-O 소식'),[body,setBody]=useState(article?.body??''),[image,setImage]=useState(article?.image??'/images/friends.jpg'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return localize(<form className="standard-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);const saved=await onSave({id:article?.id??crypto.randomUUID(),title,category,body,image,createdAt:article?.createdAt??new Date().toISOString(),comments:article?.comments??[]});setBusy(false);if(!saved)setError('소식을 저장하지 못했습니다.');}}>
 <label>소식 제목<input value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={100} required/></label>
 <label>소식 분류<input value={category} onChange={e=>setCategory(e.target.value)} maxLength={40} required/></label>
 <label>소식 내용<textarea value={body} onChange={e=>setBody(e.target.value)} minLength={3} maxLength={10000} rows={10} required/></label>
 <label>대표 이미지<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);try{setImage(await readProductPhoto(f));setError('');}catch{setError('이미지를 불러오지 못했습니다.');}finally{setBusy(false);}}}/></label>
 <img className="news-editor-image" src={image} alt="대표 이미지 미리보기"/>{error&&<p role="alert">{error}</p>}<button className="button button-dark" disabled={busy}>{busy?'사진 처리 중':'소식 저장'}</button></form>);
}
