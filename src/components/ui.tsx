'use client';


import {useLocalized} from '@/components/locale-provider';
import { useEffect, useId, useRef } from 'react';
import { ArrowUpRight, X } from 'lucide-react';

export function Logo({ small = false }: { small?: boolean }) {
  const localize=useLocalized();
  return localize(<span className={`logo ${small ? 'logo-small' : ''}`}><img className="logo-art" src="/images/ggo-wordmark.png" alt="GG-O"/></span>);
}

export function SectionTitle({ label, title, action, onAction }: { label: string; title: string; action?: string; onAction?: () => void }) {
  const localize=useLocalized();
  return localize(<div className="section-heading"><div><p className="eyebrow">{label}</p><h2>{title}</h2></div>{action && <button className="text-link" onClick={onAction}>{action}<ArrowUpRight size={17}/></button>}</div>);
}

export function Modal({ title, children, close, wide = false, drawer = false, brand = false }: { title: string; children: React.ReactNode; close: () => void; wide?: boolean; drawer?: boolean; brand?:boolean }) {
  const localize=useLocalized();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => [...Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []),...Array.from(document.querySelectorAll<HTMLElement>('.language-switcher button'))].filter(el => el.offsetParent !== null);
    (focusables()[0] ?? ref.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if(e.defaultPrevented)return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = old; document.removeEventListener('keydown', key); before?.focus(); };
  }, []);
  return localize(<div className={`modal-backdrop ${drawer ? 'is-drawer' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'drawer' : ''} ${brand?'auth-modal':''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal-heading"><h2 id={titleId} className={brand?'sr-only':undefined}>{title}</h2>{brand&&<div className="auth-modal-brand"><Logo/><p>K-문화 · 플레이 · 커뮤니티</p></div>}<button onClick={close} className="icon-button" aria-label="닫기"><X size={23}/></button></div><div className="modal-body" tabIndex={0}>{children}</div></div></div>);
}

export function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  const localize=useLocalized();
  return localize(<div className="empty-state"><span className="empty-symbol">↗</span><h2>{title}</h2><p>{text}</p>{action && <button className="button button-dark" onClick={onAction}>{action}<ArrowUpRight size={18}/></button>}</div>);
}
