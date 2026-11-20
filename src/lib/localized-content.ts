import {products,seedPosts,events} from './data';
import type {Product,CommunityEvent} from './types';

export function isPresetProductText(product:Product,value:string) {
  const original=products.find(item=>item.id===product.id);if(!original)return false;
  return Object.values(original).some(field=>typeof field==='string'&&field===value)||original.variants.some(variant=>variant.label===value);
}
export const isPresetPostText=(id:string,value:string)=>seedPosts.some(post=>post.id===id&&(post.title===value||post.caption===value));
export const isPresetCommentText=(postId:string,id:string,value:string)=>seedPosts.some(post=>post.id===postId&&post.comments.some(comment=>comment.id===id&&comment.text===value));
export const isPresetEventText=(event:CommunityEvent,value:string)=>events.some(original=>original.id===event.id&&Object.values(original).includes(value));

export const productSearchText=(product:Product,translate:(value:string)=>string)=>[product.name,product.brand,...[product.name,product.brand].filter(value=>isPresetProductText(product,value)).map(translate)].join(' ').toLocaleLowerCase();
export const postSearchText=(id:string,title:string,caption:string,translate:(value:string)=>string)=>[title,caption,...[title,caption].filter(value=>isPresetPostText(id,value)).map(translate)].join(' ').toLocaleLowerCase();
