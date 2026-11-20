'use client';

import {useLocalized} from '@/components/locale-provider';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){
  const localize=useLocalized();return localize(<main className="shell section empty-state"><h1>화면을 불러오지 못했어요.</h1><p>잠시 뒤 다시 시도해 주세요.</p><button className="button button-dark" onClick={reset}>다시 시도하기</button></main>);}
