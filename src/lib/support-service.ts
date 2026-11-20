import {getSupabase} from './supabase-service';
import type {SupportConversation,SupportDraft,SupportGateway,SupportMember,SupportTicket} from './support-types';
import {validateSupportDraft} from './support-types';

/** No browser role flag can grant live support privileges. Every RPC checks the
 * authenticated account and the server-owned user_roles table. No local fallback. */
export function serverSupportGateway():SupportGateway {
  async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T> {
    const client=getSupabase();if(!client)throw new Error('고객지원 서버가 아직 연결되지 않았습니다.');
    const {data:user,error:authError}=await client.auth.getUser();
    if(authError||!user.user)throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    const {data,error}=await client.rpc(name,args);
    if(error){const readable=/[가-힣]/.test(error.message)?error.message:'고객지원 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';throw new Error(readable);}
    if(data&&typeof data==='object'&&'error'in data&&typeof data.error==='string')throw new Error(data.error);
    return data as T;
  }
  return {
    mode:'server',
    async access(){return {isAdmin:await rpc<boolean>('is_admin')};},
    list:asAdmin=>rpc<SupportTicket[]>('list_support_tickets',{p_all:asAdmin}),
    create(draft:SupportDraft){validateSupportDraft(draft);return rpc<string>('create_support_ticket',{p_title:draft.title.trim(),p_body:draft.body.trim(),p_category:draft.category,p_password:draft.password});},
    open:(id,password)=>rpc<SupportConversation>('open_support_ticket',{p_ticket_id:id,p_password:password}),
    async reply(id,body){await rpc('reply_support_ticket',{p_ticket_id:id,p_body:body.trim()});},
    member:id=>rpc<SupportMember>('support_member_details',{p_member_id:id}),
  };
}
