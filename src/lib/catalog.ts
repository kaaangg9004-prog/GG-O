import {products as seedProducts,productVariant} from './data';
import type {CartItem,LocalState,OrderLine,Product,ProductVariant} from './types';

export const PRODUCT_PLACEHOLDER='/images/product-placeholder.svg';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number,min=0):v is string=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v);
export const safeProductImage=(v:unknown):v is string=>typeof v==='string'&&v.length<=1200000&&(
  (/^\/images\/[a-zA-Z0-9_./-]+$/.test(v)&&!v.includes('..'))||/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v));

export function parseProduct(raw:unknown):Product|null {
  if(!object(raw)||!identifier(raw.id)||!text(raw.name,100,2)||!text(raw.brand,80,2)||!['beauty','accessories','lifestyle'].includes(String(raw.category))||!text(raw.description,1200,3)||!text(raw.tag,30)||!safeProductImage(raw.image))return null;
  if(!Number.isInteger(raw.price)||Number(raw.price)<1||Number(raw.price)>1e10||!Number.isInteger(raw.stock)||Number(raw.stock)<0||Number(raw.stock)>99999)return null;
  if(raw.originalPrice!==undefined&&(!Number.isInteger(raw.originalPrice)||Number(raw.originalPrice)<Number(raw.price)||Number(raw.originalPrice)>1e10))return null;
  if(!Array.isArray(raw.variants)||raw.variants.length<1||raw.variants.length>12)return null;
  const variants:ProductVariant[]=[];
  for(const v of raw.variants){
    if(!object(v)||!identifier(v.id)||!text(v.label,50,1)||typeof v.swatch!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v.swatch)||!safeProductImage(v.image))return null;
    variants.push({id:v.id,label:v.label.trim(),swatch:v.swatch,image:v.image,...(text(v.legacyLabel,80)?{legacyLabel:v.legacyLabel}:{})});
  }
  if(new Set(variants.map(v=>v.id)).size!==variants.length||new Set(variants.map(v=>v.label.toLowerCase())).size!==variants.length)return null;
  const limits={origin:120,materials:2000,size:250,care:1500,detailContent:12000};
  for(const [key,max] of Object.entries(limits))if(raw[key]!==undefined&&!text(raw[key],max))return null;
  if(raw.detailImages!==undefined&&(!Array.isArray(raw.detailImages)||raw.detailImages.length>6||!raw.detailImages.every(safeProductImage)))return null;
  return {id:raw.id,name:raw.name.trim(),brand:raw.brand.trim(),category:raw.category as Product['category'],description:raw.description.trim(),tag:raw.tag.trim(),image:raw.image,
    price:Number(raw.price),stock:Number(raw.stock),variants,featured:raw.featured===true,
    ...(raw.originalPrice!==undefined?{originalPrice:Number(raw.originalPrice)}:{}),
    ...Object.fromEntries(Object.keys(limits).filter(k=>typeof raw[k]==='string').map(k=>[k,(raw[k] as string).trim()])),
    detailImages:Array.isArray(raw.detailImages)?[...raw.detailImages]:[]};
}
export function catalogProducts(state:Pick<LocalState,'productEdits'|'deletedProductIds'>):Product[] {
  const edits=state.productEdits??[],removed=new Set(state.deletedProductIds??[]),byId=new Map(edits.map(p=>[p.id,p]));
  return [...edits.filter(p=>!seedProducts.some(seed=>seed.id===p.id)),...seedProducts.map(p=>byId.get(p.id)??p)].filter(p=>!removed.has(p.id));
}
export function normalizedCart(cart:CartItem[],catalog:Product[]):CartItem[] {
  const result:CartItem[]=[],reserved=new Map<string,number>();
  for(const item of cart){
    const p=catalog.find(p=>p.id===item.productId);if(!p||!Number.isInteger(item.quantity)||item.quantity<=0)continue;
    const v=p.variants.find(v=>v.id===item.variant||v.label===item.variant||v.legacyLabel===item.variant);if(!v)continue;
    const count=Math.min(item.quantity,p.stock-(reserved.get(p.id)??0));if(count<=0)continue;
    reserved.set(p.id,(reserved.get(p.id)??0)+count);
    const existing=result.find(i=>i.productId===p.id&&i.variant===v.id);
    if(existing)existing.quantity+=count;else result.push({productId:p.id,variant:v.id,quantity:count});
  }
  return result;
}
export function orderSnapshots(items:CartItem[],catalog:Product[]):OrderLine[] {
  return items.map(item=>{
    const p=catalog.find(p=>p.id===item.productId);const v=p?.variants.find(v=>v.id===item.variant||v.label===item.variant||v.legacyLabel===item.variant);
    if(!p||!v)throw new Error('상품 또는 옵션이 변경됐습니다. 장바구니를 다시 확인해 주세요.');
    return {...item,variant:v.id,productName:p.name,variantLabel:v.label,image:v.image,unitPrice:p.price};
  });
}
function preserveOrders(state:LocalState,catalog:Product[]) {
  return state.orders.map(order=>({...order,items:order.items.map(item=>{
    const p=catalog.find(p=>p.id===item.productId)??seedProducts.find(p=>p.id===item.productId),v=p?productVariant(p,item.variant):undefined;
    return {...item,productName:item.productName??p?.name??'삭제된 상품',variantLabel:item.variantLabel??v?.label??item.variant,image:item.image??v?.image??PRODUCT_PLACEHOLDER,unitPrice:item.unitPrice??p?.price};
  })}));
}
export function saveProduct(state:LocalState,input:Product):LocalState {
  const product=parseProduct(input);if(!product)throw new Error('상품명·가격·재고·옵션 등 입력 내용을 확인해 주세요. 옵션 이름은 서로 달라야 합니다.');
  const previous=catalogProducts(state);
  const next={...state,productEdits:[product,...state.productEdits.filter(p=>p.id!==product.id)],deletedProductIds:state.deletedProductIds.filter(id=>id!==product.id),orders:preserveOrders(state,previous)};
  next.cart=normalizedCart(state.cart,catalogProducts(next));return next;
}
export function removeProduct(state:LocalState,id:string):LocalState {
  const catalog=catalogProducts(state);if(!catalog.some(p=>p.id===id))return state;
  return {...state,deletedProductIds:Array.from(new Set([...state.deletedProductIds,id])),cart:state.cart.filter(i=>i.productId!==id),favorites:state.favorites.filter(i=>i!==id),orders:preserveOrders(state,catalog)};
}
