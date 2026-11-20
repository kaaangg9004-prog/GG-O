'use client';

import {useLocalized} from '@/components/locale-provider';
export default function NotFound(){
  const localize=useLocalized();return localize(<main className="shell section empty-state" lang="ko"><p className="eyebrow">GG-O</p><h1>페이지를 찾을 수 없어요.</h1><p>주소를 확인하거나 홈에서 다시 둘러보세요.</p><a className="button button-dark" href="/">홈으로 돌아가기</a></main>);}
