'use client';

import {Children,cloneElement,createContext,isValidElement,useContext,useEffect,useMemo,useState} from 'react';
import type {ReactElement,ReactNode} from 'react';
import {defaultLocale,isLocale,LOCALE_KEY,localizedImage,translateText} from '@/lib/i18n';
import type {Locale} from '@/lib/i18n';

type LocaleContextValue={locale:Locale;setLocale:(locale:Locale)=>void};
// Standalone components keep their source language; the published app is
// always wrapped in LocaleProvider and starts in Vietnamese.
const LocaleContext=createContext<LocaleContextValue>({locale:'ko',setLocale:()=>{}});
export const useLocale=()=>useContext(LocaleContext);
export function LocaleProvider({children,initialLocale=defaultLocale}:{children:ReactNode;initialLocale?:Locale}) {
  const [locale,setCurrent]=useState<Locale>(initialLocale),[ready,setReady]=useState(false);
  useEffect(()=>{
    try{const saved=localStorage.getItem(LOCALE_KEY);if(isLocale(saved))setCurrent(saved);}catch{}
    setReady(true);
    const sync=(event:StorageEvent)=>{if(event.key===LOCALE_KEY&&isLocale(event.newValue))setCurrent(event.newValue);};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  useEffect(()=>{
    document.documentElement.lang=locale;
    const manifest=document.querySelector<HTMLLinkElement>('link[rel=manifest]');
    if(manifest)manifest.href=locale==='vi'?'/manifest.webmanifest':`/manifest.${locale}.webmanifest`;
    if(ready)try{localStorage.setItem(LOCALE_KEY,locale);}catch{}
  },[locale,ready]);
  const value=useMemo(()=>({locale,setLocale:(next:Locale)=>{setCurrent(next);try{localStorage.setItem(LOCALE_KEY,next);}catch{}}}),[locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
const attributes=['aria-label','aria-description','placeholder','title','alt'] as const;
function primitive(children:ReactNode):string|null {
  const values=Children.toArray(children);return values.every(value=>typeof value==='string'||typeof value==='number')?values.join(''):null;
}
function localizeNode(node:ReactNode,locale:Locale):ReactNode {
  if(locale==='ko')return node;
  if(typeof node==='string')return translateText(node,locale);
  if(Array.isArray(node))return node.map(child=>localizeNode(child,locale));
  if(!isValidElement(node))return node;
  const element=node as ReactElement<Record<string,unknown>>,props=element.props;
  if(props.translate==='no'||props['data-no-localize'])return node;
  if(typeof element.type==='string'&&['input','textarea','script','style','code'].includes(element.type)){
    if(element.type!=='input'&&element.type!=='textarea')return node;
    const translated:Record<string,unknown>={};
    for(const attribute of attributes)if(typeof props[attribute]==='string')translated[attribute]=translateText(props[attribute] as string,locale);
    return cloneElement(element,translated);
  }
  const next:Record<string,unknown>={};
  for(const attribute of attributes)if(typeof props[attribute]==='string')next[attribute]=translateText(props[attribute] as string,locale);
  if(props.lang==='ko')next.lang=locale;
  if(element.type==='img'&&typeof props.src==='string')next.src=localizedImage(props.src,locale);
  const children=props.children as ReactNode;
  if(children!==undefined){
    const plain=primitive(children);
    if(element.type==='option'&&props.value===undefined&&plain!==null)next.value=plain;
    // Keep the original array shape and element keys. Children.map adds keys
    // to unkeyed JSX; that would remount forms when switching to/from Korean.
    next.children=plain!==null?translateText(plain,locale):localizeNode(children,locale);
  }
  // Static JSX siblings stay static siblings rather than becoming a new list.
  return Array.isArray(next.children)?cloneElement(element,next,...next.children):cloneElement(element,next);
}
type Localizer=((node:ReactNode)=>ReactNode)&{text:(value:string)=>string;locale:Locale};
export function useLocalized():Localizer {
  const {locale}=useLocale();
  return Object.assign((node:ReactNode)=>localizeNode(node,locale),{locale,text:(value:string)=>translateText(value,locale)});
}
