"use client";

import type {ReactNode} from "react";
import {useState} from "react";
import {ArrowDown, ArrowUp, GripVertical, ImagePlus, RotateCcw} from "lucide-react";
import {readProductPhoto} from "@/lib/product-images";
import {translateText} from "@/lib/i18n";
import {useLocalized} from "./locale-provider";

export const widgetIds = ["hero", "news", "polls", "community", "journal", "events"] as const;
export type WidgetId = typeof widgetIds[number];
export type WidgetCopy = {label?: string; title?: string; description?: string; action?: string};
export type HomeWidget = {columns?: number; height?: number; color?: string; image?: string; opacity?: number; hidden?: boolean; copy?: Record<string, WidgetCopy>};
export type HomeLayout = {order?: WidgetId[]; widgets?: Partial<Record<WidgetId,HomeWidget>>};
const names: Record<WidgetId,string> = {hero:"홈 소개",news:"소식",events:"이벤트",polls:"투표",community:"커뮤니티",journal:"매거진"};
const fields = {label:"작은 제목",title:"제목",description:"소개 문구",action:"이동 버튼"} as const;
const defaults: Record<WidgetId,WidgetCopy> = {
  hero:{label:"GG-O",title:"한국과 베트남의 취향이 만나는 놀이터",description:"한국 문화 · 일상 이야기 · 취향 공유 · 문화교류",action:"커뮤니티 둘러보기"},
  news:{label:"DISCOVER GG-O",title:"지금, GG-O에서",action:"모든 소식"},
  events:{label:"GG-O 이벤트",title:"함께하는 이벤트",action:"전체 이벤트"},
  polls:{label:"YOUR PICK",title:"오늘의 취향 투표",action:"전체 투표"},
  community:{label:"COMMUNITY",title:"짧게 나누는 이야기",action:"커뮤니티"},
  journal:{label:"GG-O 매거진",title:"취향을 넓히는 시간",action:"더 읽어보기"},
};
const imageAllowed = (value: unknown): value is string => typeof value === "string" && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value);
const numeric = (value: unknown, min: number, max: number, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min,value)) : fallback;
export const widgetWidth = (id: WidgetId, widget?: HomeWidget) => numeric(widget?.columns,1,12, id==="polls"||id==="community"?6:12);
export function widgetOrder(layout?: HomeLayout) {
  const order = Array.isArray(layout?.order) ? layout.order.filter(id=>widgetIds.includes(id)) : [];
  return [...new Set([...order,...widgetIds])];
}
export function widgetCopy(layout: HomeLayout | undefined, id: WidgetId, locale: string, translate: (value:string)=>string, fallback?: WidgetCopy): WidgetCopy {
  return {...Object.fromEntries(Object.entries({...defaults[id],...fallback}).map(([key,value])=>[key,translate(value)])),...layout?.widgets?.[id]?.copy?.[locale]};
}

export function VisualHomeCanvas({layout, widgets, selected, onSelect, onChange}: {
  layout?: HomeLayout; widgets: Record<WidgetId,ReactNode>; selected?: WidgetId; onSelect?: (id:WidgetId)=>void; onChange?: (layout:HomeLayout)=>void;
}) {
  const order=widgetOrder(layout);
  return <div className="shell visual-home-canvas">{widgetOrder(layout).map(id=>{
    const widget=layout?.widgets?.[id];
    if (widget?.hidden&&!onSelect) return null;
    const image=imageAllowed(widget?.image)?widget.image:undefined;
    const color=typeof widget?.color==="string"&&/^#[0-9a-f]{6}$/i.test(widget.color)?widget.color:undefined;
    return <section key={id} className={`visual-home-widget ${selected===id?"is-selected":""} ${widget?.hidden?"is-hidden":""}`} style={{gridColumn:`span ${widgetWidth(id,widget)}`,minHeight:numeric(widget?.height,0,900,0)}}
      onDragOver={onChange?event=>event.preventDefault():undefined}
      onDrop={onChange?event=>{
        event.preventDefault();
        const from=event.dataTransfer.getData("application/x-ggo-widget") as WidgetId;
        if(from===id||!order.includes(from))return;
        const next=order.filter(item=>item!==from);
        next.splice(order.indexOf(id),0,from);
        onChange({...layout,order:next});
        onSelect?.(from);
      }:undefined}>
      {(image||color)&&<div className="visual-home-surface" aria-hidden="true" style={{backgroundColor:color,backgroundImage:image?`url("${image}")`:undefined,opacity:numeric(widget?.opacity,0,100,100)/100}}/>}
      {onSelect&&<button type="button" className="visual-widget-select" aria-pressed={selected===id} draggable
        onDragStart={event=>event.dataTransfer.setData("application/x-ggo-widget",id)}
        onClick={()=>onSelect(id)}><GripVertical size={14}/>{names[id]}{widget?.hidden?" · 숨김":""} 편집</button>}
      <div className="visual-home-content">{widgets[id]}</div>
      {selected===id&&onChange&&<button type="button" className="visual-widget-resize" aria-label="위젯 크기 조절"
        onKeyDown={event=>{
          const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[event.key];
          if(!delta)return;
          event.preventDefault();
          onChange({...layout,widgets:{...layout?.widgets,[id]:{...widget,
            columns:numeric(widgetWidth(id,widget)+delta[0],1,12,12),height:numeric((widget?.height??0)+delta[1],0,900,0)}}});
        }}
        onPointerDown={event=>{
          const handle=event.currentTarget;
          const item=handle.parentElement;
          const grid=item?.parentElement;
          if(!item||!grid||event.button!==0)return;
          event.preventDefault();
          const startX=event.clientX,startY=event.clientY;
          const width=widgetWidth(id,widget),height=item.getBoundingClientRect().height;
          const column=Math.max(1,grid.getBoundingClientRect().width/12);
          handle.setPointerCapture(event.pointerId);
          handle.onpointermove=move=>{
            const columns=window.matchMedia("(max-width: 700px)").matches?width:numeric(width+Math.round((move.clientX-startX)/column),1,12,width);
            onChange({...layout,widgets:{...layout?.widgets,[id]:{...widget,columns,height:numeric(Math.round(height+move.clientY-startY),0,900,0)}}});
          };
          handle.onlostpointercapture=()=>{handle.onpointermove=null;};
        }}/>}
    </section>;
  })}</div>;
}

export function VisualHomeControls({layout, change, selected, select, setUploading}:{
  layout?: HomeLayout; change:(value:HomeLayout)=>void; selected:WidgetId; select:(id:WidgetId)=>void; setUploading:(busy:boolean)=>void;
}) {
  const localize=useLocalized();
  const [locale,setLocale]=useState(localize.locale);
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const widget=layout?.widgets?.[selected]??{};
  const order=widgetOrder(layout);
  const copy=widgetCopy(layout,selected,locale,value=>translateText(value,locale));
  const patch=(values:Partial<HomeWidget>)=>change({...layout,widgets:{...layout?.widgets,[selected]:{...widget,...values}}});
  function move(from:WidgetId,to:WidgetId) {
    if(from===to||!order.includes(from)||!order.includes(to))return;
    const next=order.filter(id=>id!==from);
    next.splice(order.indexOf(to),0,from);
    change({...layout,order:next});
  }
  return <div className="visual-home-controls">
    <div className="visual-widget-list" aria-label="홈 위젯 순서">{order.map((id,index)=><div key={id} draggable={!busy}
      onDragStart={event=>event.dataTransfer.setData("text/plain",id)} onDragOver={event=>event.preventDefault()}
      onDrop={event=>{event.preventDefault();if(!busy)move(event.dataTransfer.getData("text/plain") as WidgetId,id);}}>
      <button type="button" aria-pressed={id===selected} disabled={busy} onClick={()=>select(id)}><GripVertical size={15}/>{names[id]}</button>
      <button type="button" aria-label={`${names[id]} 위로`} disabled={busy||index===0} onClick={()=>move(id,order[index-1])}><ArrowUp size={15}/></button>
      <button type="button" aria-label={`${names[id]} 아래로`} disabled={busy||index===order.length-1} onClick={()=>move(id,order[index+1])}><ArrowDown size={15}/></button>
    </div>)}</div>
    <fieldset className="visual-widget-fields" disabled={busy}>
      <legend>{names[selected]}</legend>
      <label><input type="checkbox" checked={!widget.hidden} onChange={event=>patch({hidden:!event.target.checked})}/>홈에 표시</label>
      <label>너비 <input type="range" min="1" max="12" value={widgetWidth(selected,widget)} onChange={event=>patch({columns:event.target.valueAsNumber})}/><output>{widgetWidth(selected,widget)}/12</output></label>
      <label>최소 높이 <input type="number" min="0" max="900" value={widget.height??0} onChange={event=>patch({height:numeric(event.target.valueAsNumber,0,900,0)})}/></label>
      <label>배경색 <input type="color" value={widget.color??"#eeefe7"} onChange={event=>patch({color:event.target.value})}/></label>
      <label>배경 투명도 <input type="range" min="0" max="100" value={100-(widget.opacity??100)} onChange={event=>patch({opacity:100-event.target.valueAsNumber})}/><output>{100-(widget.opacity??100)}%</output></label>
      <label className="visual-upload"><ImagePlus size={16}/>배경 이미지<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event=>{
        const file=event.target.files?.[0];event.target.value="";if(!file)return;
        setBusy(true);setUploading(true);setStatus("");
        try {const image=await readProductPhoto(file,{maxSide:1000,maxLength:350000});if(!imageAllowed(image))throw new Error("사진을 변환하지 못했습니다.");patch({image});}
        catch(error){setStatus(error instanceof Error?error.message:"사진을 읽지 못했습니다.");}
        finally{setBusy(false);setUploading(false);}
      }}/></label>
      {(widget.image||widget.color)&&<button type="button" onClick={()=>patch({image:undefined,color:undefined,opacity:undefined})}><RotateCcw size={15}/>배경 초기화</button>}
      <label>문구 언어<select value={locale} onChange={event=>setLocale(event.target.value as typeof locale)}><option value="ko">한국어</option><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
      {(Object.keys(fields) as (keyof WidgetCopy)[]).map(key=><label key={key}>{fields[key]}<input maxLength={240} value={copy[key]??""} onChange={event=>patch({copy:{...widget.copy,[locale]:{...widget.copy?.[locale],[key]:event.target.value}}})}/></label>)}
      {status&&<p role="status">{status}</p>}
    </fieldset>
  </div>;
}
