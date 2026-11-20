"use client";
import {useLocalized} from './locale-provider';
import {ArrowUpRight} from 'lucide-react';
export function HomeHero({onCommunity,onPolls}:{onCommunity:()=>void;onPolls:()=>void}) {
 const localize=useLocalized();
 return localize(<section className="home-intro shell" aria-label="GG-O 소개"><div><p className="eyebrow">GG-O · K-CULTURE COMMUNITY</p><h1>한국 문화부터 일상까지,<br/>함께 이야기해요.</h1><p>글을 읽고, 취향을 고르고, 나의 이야기를 남겨 보세요.</p></div><div className="home-intro-actions"><button className="button button-dark" onClick={onCommunity}>커뮤니티 둘러보기<ArrowUpRight size={18}/></button><button className="text-link" onClick={onPolls}>투표 둘러보기<ArrowUpRight size={17}/></button></div></section>);
}
