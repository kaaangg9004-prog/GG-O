'use client';
import {useEffect,useState} from 'react';
import {contentShareRoute} from '@/lib/content-share-link';
export function useDetailRoute(section:'news'|'events'){
 const [id,setId]=useState<string|null>(null);
 useEffect(()=>{const sync=()=>{const [route,query]=contentShareRoute(window.location).slice(1).split('?');setId(route===section?new URLSearchParams(query).get('id'):null);};sync();window.addEventListener('hashchange',sync);window.addEventListener('popstate',sync);return()=>{window.removeEventListener('hashchange',sync);window.removeEventListener('popstate',sync);};},[section]);
 const open=(next:string|null)=>{window.history.pushState(null,'',next?'#'+section+'?id='+encodeURIComponent(next):'#'+section);setId(next);window.scrollTo({top:0,behavior:'auto'});};
 return [id,open] as const;
}
