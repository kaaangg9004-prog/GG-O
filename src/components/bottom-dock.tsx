'use client';


import {useLocalized} from '@/components/locale-provider';
import type {View} from '@/lib/types';
import {primaryNavigation} from '@/lib/navigation';
import {NavigationIcon} from './navigation-icon';

export function BottomDock({view,onNavigate}:{view:View;onNavigate:(view:View)=>void}) {
  const localize=useLocalized();
  return localize(<nav className="bottom-nav bottom-nav-five" aria-label="모바일 주 메뉴">
    {primaryNavigation.map(item=>{
      const active=view===item.id;
      return <button key={item.id} className={`${active?'active':''} ${item.id==='community'?'dock-community':''}`} aria-current={active?'page':undefined} onClick={()=>onNavigate(item.id)}>{item.id==='community'?<span className="dock-community-house"><NavigationIcon view={item.id} size={26}/></span>:<NavigationIcon view={item.id} size={21}/>}<span>{item.label}</span></button>;
    })}
  </nav>);
}
