import type {OrderLine} from './types';

export const supportCategories=['일반 문의','상품 문의','주문·배송','교환·반품','회원·이용'] as const;
export type SupportCategory=typeof supportCategories[number];
export interface SupportTicket {
  id:string; title:string; category:SupportCategory; ownerId:string; authorId:string;
  createdAt:string; updatedAt:string; status:'waiting'|'in_progress'|'answered';
}
export interface SupportReply {id:string; authorId:string; body:string; createdAt:string}
export interface SupportMember {
  id:string; handle:string; joinedAt:string;
  orders:{id:string; createdAt:string; status:string; subtotal:number; items:OrderLine[]}[];
  demo:boolean;
}
export interface SupportConversation {ticket:SupportTicket; body:string; replies:SupportReply[]}
export interface SupportDraft {title:string; category:SupportCategory; body:string; password:string}
export interface SupportGateway {
  mode:'demo'|'server';
  access():Promise<{isAdmin:boolean}>;
  list(asAdmin:boolean):Promise<SupportTicket[]>;
  create(draft:SupportDraft):Promise<string>;
  open(id:string,password:string,asAdmin:boolean):Promise<SupportConversation>;
  reply(id:string,body:string,asAdmin:boolean):Promise<void>;
  complete(id:string):Promise<void>;
  member(id:string,ticketId:string,asAdmin:boolean):Promise<SupportMember>;
}
export function validateSupportDraft(draft:SupportDraft) {
  if(draft.title.trim().length<2||draft.title.length>100)throw new Error('제목은 2~100자로 입력해 주세요.');
  if(!supportCategories.includes(draft.category))throw new Error('문의 분류를 선택해 주세요.');
  if(draft.body.trim().length<10||draft.body.length>5000)throw new Error('문의 내용은 10~5,000자로 입력해 주세요.');
  if(draft.password.length<6||new TextEncoder().encode(draft.password).length>72)throw new Error('글 비밀번호는 6자 이상, 72바이트 이하로 입력해 주세요.');
}
