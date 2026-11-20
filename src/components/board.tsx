'use client';


import {useLocalized} from '@/components/locale-provider';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Bookmark,Check,ChevronLeft,ChevronRight,Flag,Heart,ImageIcon,MessageSquare,PenLine,Search,ShieldCheck,Trash2,X} from 'lucide-react';
import type {LocalState,Post,ReportReason,ReportTarget} from '@/lib/types';
import {boardCategories} from '@/lib/types';
import {dateLabel} from '@/lib/data';
import {publicPost,reportReasons,visibleComments,hasReported} from '@/lib/board';
import {EmptyState} from './ui';
import {AnonymousLabel} from './member-board';
import {TopPosts,useRankingClock} from './top-posts';
import {CommunityNavigation} from './community-navigation';
import {hotEligible,topScore,HOT_TITLE,type CommunityFilter} from '@/lib/community';
import {isPresetPostText,isPresetCommentText,postSearchText} from '@/lib/localized-content';

export function Board({posts,state,onOpen,onWrite,onModeration,compact=false,canModerate=false,initialFilter='hot'}:{posts:Post[];state:LocalState;onOpen:(id:string)=>void;onWrite:()=>void;onModeration:()=>void;compact?:boolean;canModerate?:boolean;initialFilter?:CommunityFilter}) {
  const localize=useLocalized();
  const now=useRankingClock();
  const [category,setCategory]=useState<CommunityFilter>(initialFilter),[search,setSearch]=useState(''),[sort,setSort]=useState('latest'),[savedOnly,setSavedOnly]=useState(false),[page,setPage]=useState(1);
  useEffect(()=>setPage(1),[category,search,sort,savedOnly]);
  const filtered=useMemo(()=>posts.filter(p=>(category==='전체'||category==='hot'&&hotEligible(p.views,visibleComments(p,state).length,p.createdAt,state.settings,now)||p.topic===category)&&(!savedOnly||state.savedPosts.includes(p.id))&&postSearchText(p.id,p.title,p.caption,localize.text).includes(search.trim().toLocaleLowerCase())).sort((a,b)=>category==='hot'||sort==='popular'?topScore(b.views,visibleComments(b,state).length,b.createdAt,state.settings,now)-topScore(a.views,visibleComments(a,state).length,a.createdAt,state.settings,now):b.createdAt.localeCompare(a.createdAt)),[posts,category,search,sort,savedOnly,state.savedPosts,state.likes,state.hiddenComments,state.settings,localize.locale,now]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/15));
  const current=Math.min(page,pageCount);
  const shown=compact?filtered.slice(0,5):category==='hot'?filtered.slice(0,30):filtered.slice((current-1)*15,current*15);
  const recent=category==='hot'&&shown.length<5?posts.filter(p=>!shown.some(top=>top.id===p.id)&&(!savedOnly||state.savedPosts.includes(p.id))&&postSearchText(p.id,p.title,p.caption,localize.text).includes(search.trim().toLocaleLowerCase())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5-shown.length):[];
  return localize(<div className={`anonymous-board ${compact?'board-compact':''}`}>
    {!compact&&<><div className="board-notice"><ShieldCheck size={19}/><div><strong>닉네임 없이, 편하게 이야기해요.</strong><p>편하게 이야기하되, 서로를 존중해 주세요. 욕설·비방·음란물 등 다른 사람에게 불편을 주는 내용은 삼가 주세요.</p></div>{canModerate&&<button onClick={onModeration}>신고 관리<Flag size={15}/></button>}</div>
      <CommunityNavigation value={category} onChange={value=>{setCategory(value);setSavedOnly(false);}} settings={state.settings} hotCount={posts.filter(p=>hotEligible(p.views,visibleComments(p,state).length,p.createdAt,state.settings,now)).length}/><button className="board-saved-filter" onClick={()=>setSavedOnly(!savedOnly)} aria-pressed={savedOnly}><Bookmark size={14}/>저장한 글</button>
      <div className="board-toolbar"><label className="search-field"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="제목·내용 검색" aria-label="게시판 검색"/>{search&&<button onClick={()=>setSearch('')} aria-label="검색어 지우기"><X size={16}/></button>}</label><label className="board-sort"><span className="sr-only">글 정렬</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="latest">최신순</option><option value="popular">인기순</option></select></label><button className="button button-dark" onClick={onWrite}><PenLine size={16}/>글쓰기</button></div></>}
    {category!=='hot'&&<div className="board-list-heading"><span>분류 / 제목</span><span>글쓴이</span><span>작성일</span><span>조회</span></div>}
    {!state.settings.communityWritingEnabled&&<p className="privacy-note">게시글·댓글 작성이 잠시 중단되었습니다.</p>}{category==='hot'?<TopPosts posts={shown.map(p=>({id:p.id,title:p.title,topic:p.topic,views:p.views,comments:visibleComments(p,state).length,score:topScore(p.views,visibleComments(p,state).length,p.createdAt,state.settings,now),translate:isPresetPostText(p.id,p.title)?'yes':'no'}))} onOpen={onOpen} updatedAt={now}/>:shown.length?<div className="board-list">{shown.map(post=><button className="board-row" key={post.id} onClick={()=>onOpen(post.id)}><div className="board-row-main"><span className={`board-category category-${post.topic}`}>{post.topic}</span><span className="board-title" translate={isPresetPostText(post.id,post.title)?'yes':'no'}>{post.title}</span>{hotEligible(post.views,visibleComments(post,state).length,post.createdAt,state.settings,now)&&<span className="hot-label" aria-label={HOT_TITLE}>🔥</span>}{post.image&&<ImageIcon size={13} aria-label="사진 첨부"/>}<span className="board-comment-number" aria-label={`댓글 ${visibleComments(post,state).length}개`}>[{visibleComments(post,state).length}]</span><span className="board-mobile-meta">익명 · {dateLabel(post.createdAt)} · 조회 {post.views}</span></div><span className="board-author">익명</span><time className="board-date" dateTime={post.createdAt}>{dateLabel(post.createdAt)}</time><span className="board-views">{post.views}</span></button>)}</div>:<EmptyState title="표시할 글이 없어요." text="검색어나 분류를 바꾸거나 새로운 이야기를 남겨 보세요." action="전체 글 보기" onAction={()=>{setSearch('');setCategory('전체');setSavedOnly(false);}}/>}
    {recent.length>0&&<section className="recent-stories" aria-label="최근 올라온 글"><h3>최근 올라온 글</h3>{recent.map(post=><button className="recent-story" key={post.id} onClick={()=>onOpen(post.id)}><span className="board-category">{post.topic}</span><strong translate={isPresetPostText(post.id,post.title)?'yes':'no'}>{post.title}</strong><span className="recent-meta"><MessageSquare size={14}/>{visibleComments(post,state).length}</span></button>)}</section>}
    {!compact&&<>{category!=='hot'&&<div className="board-pagination"><span>총 {filtered.length}개 글</span><div><button disabled={current===1} onClick={()=>setPage(current-1)} aria-label="이전 페이지"><ChevronLeft size={18}/></button><span>{current} / {pageCount}</span><button disabled={current===pageCount} onClick={()=>setPage(current+1)} aria-label="다음 페이지"><ChevronRight size={18}/></button></div></div>}<p className="sample-note">새 글·댓글·신고는 현재 브라우저에 저장됩니다.</p></>}
  </div>);
}

export function ReportForm({target,onSubmit,onCancel}:{target:ReportTarget;onSubmit:(target:ReportTarget,reason:ReportReason,detail:string)=>boolean;onCancel:()=>void}) {
  const localize=useLocalized();
  const [reason,setReason]=useState<ReportReason>(reportReasons[0]),[detail,setDetail]=useState('');
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    const node=form.current;if(!node)return;
    node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start',inline:'nearest'});
    node.querySelector('select')?.focus({preventScroll:true});
  },[target]);
  return localize(<form ref={form} className="report-form standard-form" aria-label={target.commentId?'댓글 신고 양식':'게시글 신고 양식'} onSubmit={e=>{e.preventDefault();if(onSubmit(target,reason,detail))onCancel();}}>
    <div className="report-form-heading"><strong>{target.commentId?'댓글 신고':'게시글 신고'}</strong><button type="button" onClick={onCancel} className="icon-button" aria-label="신고 취소"><X size={18}/></button></div>
    <label>신고 사유<select value={reason} onChange={e=>setReason(e.target.value as ReportReason)}>{reportReasons.map(r=><option key={r}>{r}</option>)}</select></label>
    <label>추가 설명 (선택)<textarea value={detail} onChange={e=>setDetail(e.target.value)} rows={3} maxLength={500} placeholder="확인이 필요한 내용을 적어 주세요. 개인정보는 적지 마세요."/></label>
    <p>접수한 내용은 신고 관리 화면에서 확인·처리할 수 있습니다. 게시글 신고는 1인 1회이며 서로 다른 이용자의 신고 50건이 쌓이면 우선 숨김 처리됩니다. 실제 회원별 집계는 서버 연결 후 활성화됩니다.</p>
    <button className="button button-dark">신고 접수<Flag size={16}/></button>
  </form>);
}

export function BoardDetail({post,state,onComment,onLike,onSave,onReport,onDelete,onBack,reporterKey=state.deviceKey,ownerKey=state.deviceKey,authenticated=true,canWrite=true,onRequireAuth=()=>{}}:{canWrite?:boolean;authenticated?:boolean;onRequireAuth?:()=>void;reporterKey?:string;ownerKey?:string;post:Post;state:LocalState;onComment:(text:string)=>boolean;onLike:()=>void;onSave:()=>void;onReport:(target:ReportTarget,reason:ReportReason,detail:string)=>boolean;onDelete?:()=>void;onBack:()=>void}) {
  const localize=useLocalized();
  const content=publicPost(post,state,ownerKey);
  const [comment,setComment]=useState(''),[reportTarget,setReportTarget]=useState<ReportTarget|null>(null);
  const liked=state.likes.includes(post.id),saved=state.savedPosts.includes(post.id),reported=hasReported(state,{postId:post.id},reporterKey);
  return localize(<article className="board-detail">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>목록으로</button>
    <p className="eyebrow">{content.topic} 게시판</p><h1 translate={isPresetPostText(post.id,content.title)?'yes':'no'}>{content.title}</h1>
    <div className="board-detail-meta"><AnonymousLabel label={content.author_label}/><time dateTime={content.createdAt}>{dateLabel(content.createdAt)}</time><span>조회 {content.views}</span><button disabled={reported} onClick={()=>authenticated?setReportTarget({postId:post.id}):onRequireAuth()}><Flag size={14}/>{reported?'게시글 신고 완료':'게시글 신고'}</button></div>
    <div className="board-body"><p translate={isPresetPostText(post.id,content.caption)?'yes':'no'}>{content.caption}</p>{content.image&&<img src={content.image} alt="게시글 첨부 사진" loading="lazy"/>}</div>
    <div className="board-detail-actions"><button onClick={onSave} aria-pressed={saved}><Bookmark size={18} fill={saved?'currentColor':'none'}/>{saved?'저장됨':'글 저장'}</button></div>
    {reportTarget&&!reportTarget.commentId&&<ReportForm key={post.id} target={reportTarget} onSubmit={onReport} onCancel={()=>setReportTarget(null)}/>}
    <section className="board-comments" aria-label="익명 댓글"><h2><MessageSquare size={19}/>댓글 <span>{content.comments.length}</span></h2>
      {content.comments.length?content.comments.map(c=><div className="board-comment" key={c.id} data-testid="anonymous-comment"><div className="board-comment-meta"><strong><AnonymousLabel label={c.author_label}/></strong><time dateTime={c.createdAt}>{dateLabel(c.createdAt)}</time><button disabled={hasReported(state,{postId:post.id,commentId:c.id},reporterKey)} aria-label={hasReported(state,{postId:post.id,commentId:c.id},reporterKey)?'댓글 신고 완료':'댓글 신고'} onClick={()=>authenticated?setReportTarget({postId:post.id,commentId:c.id}):onRequireAuth()}><Flag size={13}/>{hasReported(state,{postId:post.id,commentId:c.id},reporterKey)?'신고 완료':'신고'}</button></div><p translate={isPresetCommentText(post.id,c.id,c.text)?'yes':'no'}>{c.text}</p>{reportTarget?.commentId===c.id&&<ReportForm key={c.id} target={reportTarget} onSubmit={onReport} onCancel={()=>setReportTarget(null)}/>}</div>):<p className="no-comments">첫 댓글을 남겨 보세요.</p>}
      {authenticated&&canWrite?<form className="anonymous-comment-form" onSubmit={e=>{e.preventDefault();if(comment.trim()&&onComment(comment.trim()))setComment('');}}><label htmlFor="anonymous-comment">익명으로 댓글 쓰기</label><textarea id="anonymous-comment" value={comment} onChange={e=>setComment(e.target.value)} maxLength={500} rows={3} placeholder="서로를 존중하는 댓글을 남겨 주세요." required/><div><span>익명 번호는 이 게시글 안에서만 유지됩니다.</span><button className="button button-dark" disabled={!comment.trim()}>댓글 등록<ArrowRight size={15}/></button></div></form>:authenticated?<p className="privacy-note">게시글·댓글 작성이 잠시 중단되었습니다.</p>:<button className="button button-light" onClick={onRequireAuth}>로그인 후 댓글을 작성할 수 있습니다.</button>}
    </section>
    <div className="board-detail-bottom"><button className="button button-light" onClick={onBack}><ArrowLeft size={16}/>목록으로</button>{onDelete&&<button className="private-delete" onClick={onDelete}><Trash2 size={15}/>이 기기에서 내 글 삭제</button>}</div>
  </article>);
}
