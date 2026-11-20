'use client';

import {useLocalized} from '@/components/locale-provider';
import {CalendarDays,Compass,House,Vote,Siren,Newspaper} from 'lucide-react';
import type {PrimaryView} from '@/lib/navigation';

export function NavigationIcon({view,size=21}:{view:PrimaryView;size?:number}) {
  const localize=useLocalized();
  if(view==='news')return localize(<Newspaper size={size}/>);
  if(view==='home')return localize(<Compass size={size}/>);
  if(view==='events')return localize(<CalendarDays size={size}/>);
  if(view==='community')return localize(<House size={size} fill="currentColor" strokeWidth={1.6}/>);
  if(view==='polls')return localize(<Vote size={size}/>);
  return localize(<Siren size={size}/>);
}
