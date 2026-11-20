'use client';

import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {useLocale} from './locale-provider';
import type {Locale} from '@/lib/i18n';

const languages=[{id:'ko',label:'KOREAN',flag:'kr'},{id:'vi',label:'VIETNAM',flag:'vn'},{id:'en',label:'ENGLISH',flag:'gb'}] as const;
export function LanguageSwitcher() {
  const {locale,setLocale}=useLocale(),[open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null),toggleRef=useRef<HTMLButtonElement>(null);
  const target=languages.find(language=>language.id===(locale==='vi'?'ko':'vi'))!;
  const menuName=locale==='ko'?'언어 선택':locale==='vi'?'Chọn ngôn ngữ':'Choose language';
  useEffect(()=>{const close=(event:MouseEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[]);
  useEffect(()=>{
    if(!open)return;
    const items=()=>Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]')??[]);
    (items().find(item=>item.getAttribute('aria-checked')==='true')??items()[0])?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setOpen(false);toggleRef.current?.focus();return;}
      if(!ref.current?.contains(event.target as Node)||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();const list=items(),at=list.indexOf(document.activeElement as HTMLButtonElement);
      list[event.key==='Home'?0:event.key==='End'?list.length-1:(at+(event.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();
    };
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
  },[open]);
  const select=(next:Locale)=>{setLocale(next);setOpen(false);};
  return <div className="language-switcher" ref={ref} translate="no">
    <button type="button" className="language-quick-switch" onClick={()=>select(target.id)} aria-label={locale==='vi'?'한국어로 전환':locale==='ko'?'Chuyển sang tiếng Việt':'Switch to Vietnamese'}><img src={'/images/flag-'+target.flag+'.svg'} alt=""/><span>{target.label}</span></button>
    <button ref={toggleRef} type="button" className="language-menu-toggle" aria-label={menuName} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><ChevronDown size={13}/></button>
    {open&&<div className="language-menu" role="menu" aria-label={menuName}>{languages.map(language=><button type="button" key={language.id} role="menuitemradio" aria-checked={locale===language.id} onClick={()=>select(language.id)}><img src={'/images/flag-'+language.flag+'.svg'} alt=""/><span>{language.label}</span>{locale===language.id&&<Check size={13}/>}</button>)}</div>}
  </div>;
}
