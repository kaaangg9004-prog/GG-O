import { seedPosts } from './data';
import type { LocalState, Post, Report, ReportReason, ReportTarget } from './types';

export const reportReasons:ReportReason[]=['욕설·혐오·괴롭힘','광고·도배','개인정보 노출','부적절한 콘텐츠','기타'];
export function boardPosts(state:LocalState):Post[] {
  return [...new Map([...seedPosts,...state.posts].map(p=>[p.id,p])).values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export const visibleComments=(post:Post,state:LocalState)=>post.comments.filter(c=>!state.hiddenComments.includes(c.id));
export const visiblePosts=(state:LocalState)=>boardPosts(state).filter(p=>!state.hiddenPosts.includes(p.id)&&!state.deletedPosts.includes(p.id));
export function sameTarget(a:ReportTarget,b:ReportTarget){return a.postId===b.postId&&a.commentId===b.commentId;}
export const AUTO_HIDE_REPORTS=50;
export const hasReported=(state:LocalState,target:ReportTarget,reporterKey=state.deviceKey)=>state.reports.some(r=>sameTarget(r.target,target)&&(r.reporterKey??state.deviceKey)===reporterKey);
export const postReportCount=(state:LocalState,postId:string)=>new Set(state.reports.filter(r=>r.target.postId===postId&&!r.target.commentId).map(r=>r.reporterKey??state.deviceKey)).size;
export function addReport(state:LocalState,target:ReportTarget,reason:ReportReason,detail:string,reporterKey=state.deviceKey):LocalState {
  if(!reportReasons.includes(reason))throw new Error('신고 사유를 선택해 주세요.');
  const post=boardPosts(state).find(p=>p.id===target.postId);
  const comment=target.commentId?post?.comments.find(c=>c.id===target.commentId):undefined;
  if(!post||(target.commentId&&!comment))throw new Error('신고할 내용을 찾을 수 없습니다.');
  if(!reporterKey)throw new Error('신고하려면 로그인이 필요합니다.');
  if(hasReported(state,target,reporterKey))throw new Error('이미 접수한 신고입니다. 같은 게시글 또는 댓글은 한 번만 신고할 수 있습니다.');
  const report:Report={id:crypto.randomUUID(),reporterKey,target:{...target},reason,detail:detail.trim().slice(0,500),excerpt:(comment?.text??`${post.title}\n${post.caption}`).slice(0,600),createdAt:new Date().toISOString(),status:'pending'};
  const next={...state,reports:[report,...state.reports]};
  if(!target.commentId&&postReportCount(state,target.postId)<AUTO_HIDE_REPORTS&&postReportCount(next,target.postId)>=AUTO_HIDE_REPORTS){
    next.hiddenPosts=Array.from(new Set([...state.hiddenPosts,target.postId]));
    next.autoHiddenPosts=Array.from(new Set([...state.autoHiddenPosts,target.postId]));
  }
  return next;
}
export function resolveReport(state:LocalState,id:string,decision:'hidden'|'dismissed'):LocalState {
  const report=state.reports.find(r=>r.id===id);
  if(!report||report.status!=='pending')return state;
  const next={...state,reports:state.reports.map(r=>sameTarget(r.target,report.target)&&r.status==='pending'?{...r,status:decision,resolvedAt:new Date().toISOString()}:r)};
  if(decision==='hidden') {
    if(report.target.commentId)next.hiddenComments=Array.from(new Set([...state.hiddenComments,report.target.commentId]));
    else next.hiddenPosts=Array.from(new Set([...state.hiddenPosts,report.target.postId]));
  }
  if(!report.target.commentId){
    next.autoHiddenPosts=state.autoHiddenPosts.filter(p=>p!==report.target.postId);
    if(decision==='dismissed'&&state.autoHiddenPosts.includes(report.target.postId))next.hiddenPosts=state.hiddenPosts.filter(p=>p!==report.target.postId);
  }
  return next;
}
export function restoreReportedContent(state:LocalState,id:string):LocalState {
  const report=state.reports.find(r=>r.id===id);if(!report)return state;
  return {...state,autoHiddenPosts:report.target.commentId?state.autoHiddenPosts:state.autoHiddenPosts.filter(p=>p!==report.target.postId),hiddenPosts:report.target.commentId?state.hiddenPosts:state.hiddenPosts.filter(p=>p!==report.target.postId),
    hiddenComments:state.hiddenComments.filter(c=>c!==report.target.commentId),
    reports:state.reports.map(r=>sameTarget(r.target,report.target)&&r.status==='hidden'?{...r,status:'dismissed',resolvedAt:new Date().toISOString()}:r)};
}
/** Browser-demo projection only. Live identity mapping stays in the database. */
export function publicPost(post:Post,state:LocalState,ownerKey=state.deviceKey) {
  const numbers=new Map<string,number>();
  for(const c of [...post.comments].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))if(c.ownerKey!==post.ownerKey&&!numbers.has(c.ownerKey))numbers.set(c.ownerKey,numbers.size+1);
  return {id:post.id,title:post.title,caption:post.caption,topic:post.topic,image:post.image,tags:post.tags,views:post.views,createdAt:post.createdAt,
    author:'익명(글쓴이)',author_label:'Ẩn danh (Tác giả)',is_mine:post.ownerKey===ownerKey,
    comments:visibleComments(post,state).map(c=>({id:c.id,text:c.text,createdAt:c.createdAt,author:c.ownerKey===post.ownerKey?'익명(글쓴이)':`익명 ${numbers.get(c.ownerKey)}`,author_label:c.ownerKey===post.ownerKey?'Ẩn danh (Tác giả)':`Ẩn danh ${numbers.get(c.ownerKey)}`,is_mine:c.ownerKey===ownerKey}))};
}
