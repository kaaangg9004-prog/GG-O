import type {LocalState,Comment} from './types';
import {safeProductImage} from './catalog';
export interface NewsArticle {id:string;title:string;category:string;body:string;image:string;createdAt:string;comments:Comment[]}
export const seedNews:NewsArticle[]=[
 {id:'welcome',title:'GG-O에서 함께 나누고 싶은 이야기',category:'서비스 안내',body:'한국 문화부터 우리의 일상까지, GG-O는 서로의 취향을 발견하는 공간입니다.\n\n소식에서는 운영자가 전하는 안내와 이야기를 읽고, 댓글로 여러분의 의견을 남길 수 있어요. 커뮤니티에서는 누구나 자신의 이야기를 시작할 수 있습니다.\n\n작성한 글과 댓글은 사용하는 브라우저에 저장됩니다.',image:'/images/friends.jpg',createdAt:'2026-11-18T00:00:00Z',comments:[]},
 {id:'animation-board',title:'애니메이션 이야기도, 이제 GG-O에서',category:'게시판 안내',body:'좋아하는 작품, 기억에 남는 장면, 다음에 볼 작품까지. 커뮤니티의 애니메이션 게시판에서 이야기를 나눠 주세요.\n\n아직 보지 않은 사람을 위해 제목에는 스포일러를 피하고, 본문 앞에 스포일러 안내를 적어 주세요. 서로의 취향을 존중하는 댓글을 부탁드립니다.',image:'/images/concert.jpg',createdAt:'2026-11-18T00:00:00Z',comments:[]}
];
export function parseNews(v:unknown):NewsArticle|null {
 if(!v||typeof v!=='object')return null;const n=v as NewsArticle;
 if(typeof n.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(n.id)||typeof n.title!=='string'||n.title.trim().length<2||n.title.length>100||typeof n.category!=='string'||!n.category.trim()||n.category.length>40||typeof n.body!=='string'||n.body.trim().length<3||n.body.length>10000||!safeProductImage(n.image)||!Number.isFinite(Date.parse(n.createdAt)))return null;
 const comments=Array.isArray(n.comments)?n.comments.filter(c=>c&&typeof c.id==='string'&&typeof c.ownerKey==='string'&&c.ownerKey&&typeof c.text==='string'&&c.text.trim()&&c.text.length<=500&&Number.isFinite(Date.parse(c.createdAt))):[];
 return {...n,title:n.title.trim(),category:n.category.trim(),body:n.body.trim(),comments};
}
export const listedNews=(s:Pick<LocalState,'newsEdits'|'deletedNewsIds'>)=>[...new Map([...seedNews,...s.newsEdits].map(n=>[n.id,n])).values()].filter(n=>!s.deletedNewsIds.includes(n.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
export function saveNews(s:LocalState,n:NewsArticle,admin:boolean):LocalState {
 if(!admin)throw new Error('운영자만 소식을 작성할 수 있습니다.');const value=parseNews(n);if(!value)throw new Error('제목과 내용을 확인해 주세요.');
 const previous=listedNews(s).find(a=>a.id===n.id);
 return {...s,newsEdits:[{...value,comments:previous?.comments??[]},...s.newsEdits.filter(a=>a.id!==n.id)]};
}
export function commentNews(s:LocalState,id:string,text:string,ownerKey:string):LocalState {
 if(!ownerKey||!text.trim()||text.trim().length>500)throw new Error('댓글 내용을 확인해 주세요.');const n=listedNews(s).find(a=>a.id===id);if(!n)throw new Error('소식을 찾을 수 없습니다.');
 return {...s,newsEdits:[{...n,comments:[...n.comments,{id:crypto.randomUUID(),text:text.trim(),ownerKey,createdAt:new Date().toISOString()}]},...s.newsEdits.filter(a=>a.id!==id)]};
}
export function anonymousNewsComments(n:NewsArticle) {
 const names=new Map<string,number>();
 return n.comments.map(c=>{if(!names.has(c.ownerKey))names.set(c.ownerKey,names.size+1);return {id:c.id,text:c.text,createdAt:c.createdAt,number:names.get(c.ownerKey)!};});
}
