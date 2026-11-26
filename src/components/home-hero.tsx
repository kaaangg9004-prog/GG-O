"use client";
import {useLocalized} from './locale-provider';
import {ArrowUpRight} from 'lucide-react';
export function HomeHero({onCommunity,onPolls,title,description,onEdit}:{onCommunity:()=>void;onPolls:()=>void;title?:string;description?:string;onEdit?:(field:"title"|"description",value:string)=>void}) {
 const localize=useLocalized();
 return localize(<section className="home-intro shell" aria-label="GG-O 소개"><div><p className="eyebrow">GG-O</p><h1 contentEditable={onEdit?"plaintext-only":undefined} suppressContentEditableWarning onBlur={onEdit?event=>onEdit("title",event.currentTarget.textContent?.slice(0,240)??""):undefined} translate={title!==undefined?"no":undefined}>{title??"한국과 베트남의 취향이 만나는 놀이터"}</h1><p contentEditable={onEdit?"plaintext-only":undefined} suppressContentEditableWarning onBlur={onEdit?event=>onEdit("description",event.currentTarget.textContent?.slice(0,240)??""):undefined} translate={description!==undefined?"no":undefined}>{description??"한국 문화 · 일상 이야기 · 취향 공유 · 문화교류"}</p></div><div className="home-intro-actions"><button className="button button-dark" onClick={onCommunity}>커뮤니티 둘러보기<ArrowUpRight size={18}/></button><button className="text-link" onClick={onPolls}>투표 둘러보기<ArrowUpRight size={17}/></button></div></section>);
}
