"use client";

import {useEffect, useRef, useState} from "react";
import type {CSSProperties, PointerEvent as ReactPointerEvent} from "react";
import {getSupabase} from "@/lib/supabase-service";
import {readProductPhoto} from "@/lib/product-images";

type Position = {x: number; y: number};
type Background = Position & {color: string; image: string; mode: "cover" | "position"};
type Banner = Position & {id: string; image: string; href: string; width: number; height: number};
export type VisualPage = {background?: Background; banners?: Banner[]};
export type VisualDocument = {
  text?: Record<string, string>;
  menu?: string[];
  links?: {id:string; label:string; href:string}[];
  pages?: Record<string, VisualPage>;
};
type Published = {revision: number; document: VisualDocument};
const empty: Published = {revision: 0, document: {}};
const dataImage = (value: unknown): value is string =>
  typeof value === "string" && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value);
const coordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50;
const dimension = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1600, Math.max(40, value)) : fallback;
export const visualHref = (value: unknown) => typeof value === "string" && (/^\/(?![\\/])[^\\\s]*$/.test(value) || /^https?:\/\/[^\s]+$/i.test(value)) ? value : "#";
export function visualText(document: VisualDocument, key: string, fallback: string) {
  const value = document.text?.[key];
  return typeof value === "string" ? value.slice(0, 240) : fallback;
}
export function usePublishedVisual() {
  const [published, setPublished] = useState<Published>(empty);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let active = true;
    void client.rpc("visual_site_published").then(({data, error}) => {
      if (active && !error && data?.document && Number.isInteger(data.revision)) {
        setPublished(data);
        setLoaded(true);
      }
    });
    return () => {active = false;};
  }, []);
  return {published, setPublished, loaded};
}

export function visualBackground(page?: VisualPage): CSSProperties {
  const bg = page?.background;
  if (!bg) return {};
  return {
    backgroundColor: /^#[0-9a-f]{6}$/i.test(bg.color) ? bg.color : undefined,
    backgroundImage: dataImage(bg.image) ? `url("${bg.image}")` : undefined,
    backgroundPosition: `${coordinate(bg.x)}% ${coordinate(bg.y)}%`,
    backgroundSize: bg.mode === "cover" ? "cover" : "auto",
    backgroundRepeat: "no-repeat",
  };
}

export function VisualBanners({page, editing, position}: {
  page?: VisualPage; editing?: boolean; position?: (id: string, xy: Position) => void;
}) {
  if (!Array.isArray(page?.banners)) return null;
  return <>{page.banners.slice(0, 8).map(banner => dataImage(banner?.image) &&
    <a key={banner.id} className="visual-site-banner" href={visualHref(banner.href)}
      style={{left: `${coordinate(banner.x)}%`, top: `${coordinate(banner.y)}%`, width: dimension(banner.width, 280), height: dimension(banner.height, 120)}}
      onClick={editing ? event => event.preventDefault() : undefined}
      onPointerDown={editing && position ? event => {
        const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
        const start = {x: event.clientX, y: event.clientY};
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        target.onpointermove = move => position(banner.id, {
          x: coordinate(banner.x + (move.clientX - start.x) * 100 / Math.max(1, bounds.width)),
          y: coordinate(banner.y + (move.clientY - start.y) * 100 / Math.max(1, bounds.height)),
        });
        target.onlostpointercapture = () => {target.onpointermove = null;};
      } : undefined}
      ><img src={banner.image} alt="배너"/></a>)}</>;
}

export function VisualEditor({document, setDocument, revision, view, navigate, menu, pages, labels, close, published}: {
  document: VisualDocument; setDocument: (value: VisualDocument) => void; revision: number;
  view: string; navigate: (view: string) => void; pages: {id: string; label: string}[]; menu: {id: string; label: string}[];
  labels: {key: string; label: string; fallback: string}[]; close: () => void; published: (value: Published) => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(280), [height, setHeight] = useState(120);
  const [href, setHref] = useState("/");
  const [linkLabel,setLinkLabel]=useState("");
  const [linkUrl,setLinkUrl]=useState("/");
  const [positioning, setPositioning] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  const page = document.pages?.[view] ?? {};
  const background = page.background ?? {color: "#f8f8f4", image: "", mode: "cover", x: 50, y: 50};
  const changePage = (newPage: VisualPage) => setDocument({...document, pages: {...document.pages, [view]: newPage}});
  const moveBackground = (xy: Position) => changePage({...page, background: {...background, ...xy}});
  const ordered = [...menu].sort((a,b) => (document.menu?.indexOf(a.id) ?? -1) - (document.menu?.indexOf(b.id) ?? -1));
  const reorder = (from: string, to: string) => {
    if (from === to || !ordered.some(item => item.id === from)) return;
    const ids = ordered.map(item => item.id).filter(id => id !== from);
    ids.splice(ordered.findIndex(item => item.id === to), 0, from);
    setDocument({...document,menu:ids});
  };
  const upload = async (file: File, kind: "banner" | "background") => {
    setBusy(true);setStatus("");
    try {
      const image = await readProductPhoto(file);
      if (!dataImage(image)) throw new Error("사진을 WebP로 변환하지 못했습니다.");
      if (kind === "background") changePage({...page,background:{...background,image}});
      else changePage({...page,banners:[...(page.banners ?? []),{id:crypto.randomUUID(),x:50,y:15,image,href:visualHref(href),width,height}]});
    } catch (error) {setStatus(error instanceof Error ? error.message : "사진을 불러오지 못했습니다.");}
    finally {setBusy(false);}
  };
  const submit = async () => {
    const value = password.current?.value;
    if (!value || busy) return;
    setBusy(true);setStatus("");
    try {
      const client = getSupabase();
      if (!client) throw new Error("서버 연결을 확인해 주세요.");
      const {data,error} = await client.rpc("visual_site_publish",{p_revision:revision,p_document:document,p_password:value});
      if (error) throw new Error("관리자 권한 또는 서버 연결을 확인해 주세요.");
      if (data !== "ok") throw new Error(({
        password:"승인 비밀번호를 확인해 주세요.", limited:"승인 시도가 너무 많습니다. 15분 뒤 다시 시도해 주세요.",
        conflict:"다른 관리자의 변경이 먼저 공개됐습니다. 새로고침해 최신 버전을 확인해 주세요.",
        invalid:"사진 용량이 너무 큽니다. 사진을 줄인 뒤 다시 시도해 주세요.", unconfigured:"승인 비밀번호 설정을 확인해 주세요.",
      } as Record<string,string>)[data] ?? "변경을 저장하지 못했습니다.");
      published({document,revision:revision+1});
    } catch (error) {setStatus(error instanceof Error ? error.message : "저장에 실패했습니다.");}
    finally {if(password.current)password.current.value="";setBusy(false);}
  };
  return <aside className="visual-site-editor" aria-label="페이지 편집">
    <header><strong>페이지 편집 · 관리자 미리보기</strong>
      <button className="button button-dark" disabled={busy} onClick={()=>{setStatus("");setStep(1);}}>저장</button>
      <button className="button button-light" disabled={busy} onClick={close}>편집 닫기</button>
    </header>
    <details open><summary>화면 문구와 메뉴</summary>
      {labels.map(item=><label key={item.key}>{item.label}<input maxLength={240} value={visualText(document,item.key,item.fallback)}
        onChange={event=>setDocument({...document,text:{...document.text,[item.key]:event.target.value}})}/></label>)}
      {ordered.map((item,index)=><div key={item.id} draggable onDragStart={event=>event.dataTransfer.setData("text/plain",item.id)}
        onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();reorder(event.dataTransfer.getData("text/plain"),item.id);}}>
        <label>{item.label}<input maxLength={240} value={visualText(document,"menu."+item.id,item.label)} onChange={event=>setDocument({...document,text:{...document.text,["menu."+item.id]:event.target.value}})}/></label>
        <button disabled={index===0} onClick={()=>reorder(item.id,ordered[index-1].id)}>위로</button>
        <button disabled={index===ordered.length-1} onClick={()=>reorder(item.id,ordered[index+1].id)}>아래로</button>
      </div>)}
      {(document.links ?? []).map(link=><div key={link.id}>{link.label} <button onClick={()=>setDocument({...document,links:document.links?.filter(item=>item.id!==link.id)})}>메뉴 제거</button></div>)}
      <label>새 메뉴 이름<input maxLength={50} value={linkLabel} onChange={event=>setLinkLabel(event.target.value)}/></label>
      <label>새 메뉴 주소<input value={linkUrl} onChange={event=>setLinkUrl(event.target.value)}/></label>
      <button disabled={!linkLabel.trim()||visualHref(linkUrl)==="#"||(document.links?.length??0)>=4} onClick={()=>{setDocument({...document,links:[...(document.links??[]),{id:crypto.randomUUID(),label:linkLabel.trim(),href:visualHref(linkUrl)}]});setLinkLabel("");}}>메뉴 추가</button>
    </details>
    <details><summary>페이지별 배경과 배너</summary>
      <label>편집할 페이지<select value={view} onChange={event=>navigate(event.target.value)}>{pages.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>배경색<input type="color" value={background.color} onChange={event=>changePage({...page,background:{...background,color:event.target.value}})}/></label>
      <label>배경 이미지<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,"background");}}/></label>
      {background.image&&<button onClick={()=>changePage({...page,background:{...background,image:""}})}>배경 이미지 제거</button>}
      <label>배경 표시<select value={background.mode} onChange={event=>changePage({...page,background:{...background,mode:event.target.value as Background["mode"]}})}><option value="cover">전체 배경</option><option value="position">특정 위치</option></select></label>
      <button onClick={()=>setPositioning(value=>!value)}>{positioning?"확인":"위치정하기"}</button>
      {positioning&&<div className="visual-position-board" tabIndex={0} aria-label="배경 위치 조정" style={visualBackground(page)}
        onKeyDown={event=>{
          const offsets: Record<string,number[]> = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
          const offset=offsets[event.key];if(!offset)return;event.preventDefault();moveBackground({x:coordinate(background.x+offset[0]),y:coordinate(background.y+offset[1])});
        }} onPointerDown={(event:ReactPointerEvent<HTMLDivElement>)=>{
          const target=event.currentTarget;
          const bounds=target.getBoundingClientRect();
          const move=(x:number,y:number)=>moveBackground({x:coordinate((x-bounds.left)*100/bounds.width),y:coordinate((y-bounds.top)*100/bounds.height)});
          move(event.clientX,event.clientY);target.setPointerCapture(event.pointerId);
          target.onpointermove=pointer=>move(pointer.clientX,pointer.clientY);
          target.onlostpointercapture=()=>{target.onpointermove=null;};
        }} />}
      <label>배너 가로<input type="number" min="40" max="1600" value={width} onChange={event=>setWidth(event.target.valueAsNumber)}/></label>
      <label>배너 세로<input type="number" min="40" max="1600" value={height} onChange={event=>setHeight(event.target.valueAsNumber)}/></label>
      <label>이동 주소<input value={href} onChange={event=>setHref(event.target.value)}/></label>
      <label>배너 이미지<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||(page.banners?.length??0)>=8} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,"banner");}}/></label>
      {page.banners?.map((item,index)=><div key={item.id}><label>배너 {index+1} 이동 주소<input value={item.href} onChange={event=>changePage({...page,banners:page.banners!.map(banner=>banner.id===item.id?{...banner,href:event.target.value}:banner)})}/></label><button onClick={()=>changePage({...page,banners:page.banners!.filter(banner=>banner.id!==item.id)})}>배너 제거</button></div>)}
    </details>
    {step>0&&<section role="dialog" aria-modal="true" aria-label="공개 승인" className="visual-approval">
      {step===1?<><strong>저장하시겠습니까?</strong><button onClick={()=>setStep(2)}>예</button></>:
        <form onSubmit={event=>{event.preventDefault();void submit();}}><label>승인 비밀번호<input ref={password} type="password" autoComplete="off" maxLength={72} required autoFocus/></label><button disabled={busy}>확인</button></form>}
      <button disabled={busy} onClick={()=>{setStep(0);setStatus("");}}>취소</button>
    </section>}
    {status&&<p role="status">{status}</p>}
  </aside>;
}
