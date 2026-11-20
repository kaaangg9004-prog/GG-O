import {getSupabase} from './supabase-service';
import {anonymousError} from './anonymous-service';
import type {NewsArticle} from './news';
import type {CommunityEvent} from './types';
export type SharedNews = Omit<NewsArticle,'comments'> & {comments:{id:string;text:string;createdAt:string;number:number}[]};
export function editorialGateway(){
 const client=getSupabase();if(!client)return null;
 const rpc=async(name:string,args?:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw anonymousError(error);return data;};
 return {
  news:async():Promise<SharedNews[]>=>rpc('editorial_list',{p_kind:'news'}),
  events:async():Promise<CommunityEvent[]>=>rpc('editorial_list',{p_kind:'event'}),
  save:async(kind:'news'|'event',document:NewsArticle|CommunityEvent)=>{await rpc('editorial_save',{p_kind:kind,p_document:document});},
  remove:async(kind:'news'|'event',id:string)=>{await rpc('editorial_delete',{p_kind:kind,p_id:id});},
  comment:async(id:string,body:string)=>{await rpc('news_comment',{p_id:id,p_body:body});},
  deleteComment:async(id:string)=>{await rpc('news_comment_delete',{p_id:id});},
  reactions:async():Promise<Record<string,'like'|'dislike'>>=>rpc('event_my_reactions'),
  react:async(id:string,reaction:'like'|'dislike'|null)=>{await rpc('event_react',{p_id:id,p_reaction:reaction});}
 };
}
