import {parseNews} from './news';
import type { CartItem, LocalState, Product, Post, Comment, Report, OrderLine } from './types';
import { boardCategories } from './types';
import { products, productVariant, seedPosts } from './data';
import {catalogProducts,normalizedCart,parseProduct,PRODUCT_PLACEHOLDER} from './catalog';
import {listedEvents,parseEvent} from './event-catalog';
import {defaultSiteSettings,normalizeBoardCategory,parseSiteSettings} from './community';
import {parseMagazine} from './magazine';
import {restorePollState} from './polls';

// Keep the storage key so existing testers retain their cart, favorites and orders.
export const STORAGE_KEY = 'ggo-experience-v1';
export const initialState: LocalState = {
  newsEdits:[],deletedNewsIds:[],schema:2,deviceKey:'',articleEdits:[],deletedArticleIds:[],demoMemberStatuses:{},settings:structuredClone(defaultSiteSettings),deletedPosts:[],postViews:{},cart:[],favorites:[],likes:[],savedPosts:[],hiddenPosts:[],hiddenComments:[],
  posts:[],reports:[],orders:[],profile:null,eventInterests:[],productEdits:[],deletedProductIds:[],eventReactions:{},eventEdits:[],deletedEventIds:[],autoHiddenPosts:[],pollEdits:[],deletedPollIds:[],pollBallots:[],pollComments:[],
};
export function cartTotal(cart:CartItem[],catalog:Product[]) {
  return cart.reduce((sum,item)=>sum+(catalog.find(p=>p.id===item.productId)?.price??0)*item.quantity,0);
}
export function updateCart(cart:CartItem[],item:CartItem,stock:number):CartItem[] {
  const quantity=Math.max(0,Math.min(stock,Math.floor(Number.isFinite(item.quantity)?item.quantity:0)));
  const index=cart.findIndex(c=>c.productId===item.productId&&c.variant===item.variant);
  if(!quantity)return cart.filter((_,i)=>i!==index);
  if(index<0)return [...cart,{...item,quantity}];
  return cart.map((c,i)=>i===index?{...item,quantity}:c);
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const string=(v:unknown):v is string=>typeof v==='string';
const strings=(v:unknown)=>Array.isArray(v)?Array.from(new Set(v.filter(string))):[];
const validDate=(v:unknown):v is string=>string(v)&&Number.isFinite(Date.parse(v));
function restoreCart(value:unknown):CartItem[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(item=>{
    if(!object(item)||!string(item.productId)||!string(item.variant)||!Number.isInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>99999)return [];
    return [{productId:item.productId,variant:item.variant,quantity:Number(item.quantity)}];
  });
}
function restoreOrderLines(value:unknown,catalog:Product[]):OrderLine[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(item=>{
    if(!object(item)||!string(item.productId)||!string(item.variant)||!Number.isInteger(item.quantity)||Number(item.quantity)<1)return [];
    const p=catalog.find(p=>p.id===item.productId)??products.find(p=>p.id===item.productId),v=p?productVariant(p,item.variant):undefined;
    return [{productId:item.productId,variant:v?.id??item.variant,quantity:Number(item.quantity),
      productName:string(item.productName)?item.productName:p?.name??'삭제된 상품',variantLabel:string(item.variantLabel)?item.variantLabel:v?.label??item.variant,
      image:string(item.image)?item.image:v?.image??PRODUCT_PLACEHOLDER,unitPrice:typeof item.unitPrice==='number'&&Number.isFinite(item.unitPrice)&&item.unitPrice>0?item.unitPrice:p?.price}];
  });
}
function restoreComments(value:unknown,deviceKey:string,legacy:boolean):Comment[] {
  if(!Array.isArray(value))return [];
  return value.flatMap(c=>object(c)&&string(c.id)&&string(c.text)&&validDate(c.createdAt)?[{
    id:c.id,text:c.text,createdAt:c.createdAt,ownerKey:!legacy&&string(c.ownerKey)?c.ownerKey:deviceKey,
  }]:[]);
}
export function readState(raw:string|null):LocalState {
  const result=structuredClone(initialState);result.deviceKey=crypto.randomUUID();
  if(!raw)return result;
  try {
    const parsed:unknown=JSON.parse(raw);
    if(!object(parsed)||(parsed.schema!==1&&parsed.schema!==2))return result;
    if(object(parsed.demoMemberStatuses)){for(const [account,status] of Object.entries(parsed.demoMemberStatuses))if(account==='AAAA'&&object(status)&&['active','suspended','banned'].includes(String(status.status)))result.demoMemberStatuses[account]={status:status.status as 'active'|'suspended'|'banned',suspendedUntil:validDate(status.suspendedUntil)?status.suspendedUntil:null};}
    if(Array.isArray(parsed.articleEdits))result.articleEdits=parsed.articleEdits.flatMap(v=>{const a=parseMagazine(v);return a?[a]:[];});result.deletedArticleIds=strings(parsed.deletedArticleIds);
    if(Array.isArray(parsed.newsEdits))result.newsEdits=parsed.newsEdits.flatMap(v=>{const n=parseNews(v);return n?[n]:[];});result.deletedNewsIds=strings(parsed.deletedNewsIds);
    const legacy=parsed.schema===1;result.settings=parseSiteSettings(parsed.settings)??structuredClone(defaultSiteSettings);result.deletedPosts=strings(parsed.deletedPosts);
    if(object(parsed.postViews))for(const [id,date] of Object.entries(parsed.postViews))if(validDate(date))result.postViews[id]=date;
    if(!legacy&&string(parsed.deviceKey)&&parsed.deviceKey)result.deviceKey=parsed.deviceKey;
    for(const key of ['favorites','likes','savedPosts','hiddenPosts','hiddenComments','eventInterests','autoHiddenPosts'] as const)result[key]=strings(parsed[key]);
    if(object(parsed.eventReactions)){
      for(const [id,reaction] of Object.entries(parsed.eventReactions))if(id.length<=80&&(reaction==='like'||reaction==='dislike'))result.eventReactions[id]=reaction;
    }else{for(const id of result.eventInterests)result.eventReactions[id]='like';}
    if(Array.isArray(parsed.eventEdits)){
      const seen=new Set<string>();
      result.eventEdits=parsed.eventEdits.flatMap(value=>{const event=parseEvent(value);if(!event||seen.has(event.id))return [];seen.add(event.id);return [event];});
    }
    result.deletedEventIds=strings(parsed.deletedEventIds).filter(id=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id));
    const eventIds=new Set(listedEvents(result).map(event=>event.id));
    result.eventReactions=Object.fromEntries(Object.entries(result.eventReactions).filter(([id])=>eventIds.has(id)));
    result.eventInterests=Object.keys(result.eventReactions).filter(id=>result.eventReactions[id]==='like');
    if(Array.isArray(parsed.productEdits))result.productEdits=parsed.productEdits.flatMap(value=>{const p=parseProduct(value);return p?[p]:[];});
    result.deletedProductIds=strings(parsed.deletedProductIds).filter(id=>id.length<=80);
    const catalog=catalogProducts(result);
    result.cart=normalizedCart(restoreCart(parsed.cart),catalog);
    result.favorites=result.favorites.filter(id=>catalog.some(p=>p.id===id));
    if(Array.isArray(parsed.posts))result.posts=parsed.posts.flatMap(value=>{
      if(!object(value)||!string(value.id)||!string(value.caption)||!validDate(value.createdAt)||!Array.isArray(value.comments))return [];
      const seed=seedPosts.find(p=>p.id===value.id);
      const comments=restoreComments(value.comments,result.deviceKey,legacy);
      if(legacy&&seed)return [{...seed,comments:[...seed.comments,...comments.filter(c=>!seed.comments.some(original=>original.id===c.id))]}];
      const topic=normalizeBoardCategory(value.topic);
      const post:Post={id:value.id,title:string(value.title)?value.title:value.caption.slice(0,70),caption:value.caption,
        image:string(value.image)?value.image:'',tags:strings(value.tags),likes:typeof value.likes==='number'&&Number.isFinite(value.likes)?value.likes:0,
        views:typeof value.views==='number'&&Number.isFinite(value.views)?value.views:0,topic,comments,createdAt:value.createdAt,
        ownerKey:!legacy&&string(value.ownerKey)?value.ownerKey:result.deviceKey};
      return [post];
    });
    if(Array.isArray(parsed.orders))result.orders=parsed.orders.flatMap(o=>object(o)&&string(o.id)&&o.status==='demo'&&typeof o.subtotal==='number'&&Number.isFinite(o.subtotal)&&validDate(o.createdAt)&&Array.isArray(o.items)?[{id:o.id,status:'demo' as const,items:restoreOrderLines(o.items,catalog),subtotal:o.subtotal,createdAt:o.createdAt}]:[]);
    if(object(parsed.profile)&&string(parsed.profile.name)&&string(parsed.profile.handle)&&string(parsed.profile.bio))result.profile={name:parsed.profile.name,handle:parsed.profile.handle,bio:parsed.profile.bio};
    if(!legacy&&Array.isArray(parsed.reports))result.reports=parsed.reports.flatMap(r=>{
      if(!object(r)||!string(r.id)||!object(r.target)||!string(r.target.postId)||!string(r.reason)||!string(r.detail)||!string(r.excerpt)||!validDate(r.createdAt)||!['pending','hidden','dismissed'].includes(String(r.status)))return [];
      const target={postId:r.target.postId,...(string(r.target.commentId)?{commentId:r.target.commentId}:{})};
      return [{id:r.id,target,reporterKey:string(r.reporterKey)&&r.reporterKey?r.reporterKey:result.deviceKey,reason:r.reason as Report['reason'],detail:r.detail,excerpt:r.excerpt,createdAt:r.createdAt,status:r.status as Report['status'],...(validDate(r.resolvedAt)?{resolvedAt:r.resolvedAt}:{})}];
    });
    // Old follow/block data and author identity fields are deliberately not restored.
    restorePollState(parsed,result);
    return result;
  }catch{return result;}
}
export const toggleId=(ids:string[],id:string)=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id];
