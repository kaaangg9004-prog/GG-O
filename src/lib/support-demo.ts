import type {SupportConversation,SupportDraft,SupportGateway,SupportMember,SupportReply,SupportTicket} from './support-types';
import {validateSupportDraft} from './support-types';
import {isDemoAdminAccount} from './demo-login';

// Device-local demonstration only. The local management key is NOT an admin
// security boundary. Live support uses server-authorized RPCs instead.
export const SUPPORT_STORAGE_KEY='ggo-support-demo-v1';
const ADMIN_KEY='ggo-support-demo-management-key-v1';
const MEMBER_DATE_KEY='ggo-support-demo-member-date-v1';
const ROUNDS=210000;
type Sealed={iv:string; cipher:string};
type StoredTicket={ticket:SupportTicket; salt:string; passwordKey:Sealed; adminKey:Sealed; content:Sealed};
type Payload={body:string; replies:SupportReply[]; member:SupportMember};
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const random=(length:number)=>crypto.getRandomValues(new Uint8Array(length));
const aes=(bytes:Uint8Array<ArrayBuffer>)=>crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
async function seal(key:CryptoKey,bytes:Uint8Array<ArrayBuffer>):Promise<Sealed> {
  const iv=random(12),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);
  return {iv:encode(iv),cipher:encode(new Uint8Array(cipher))};
}
async function unseal(key:CryptoKey,sealed:Sealed) {
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(sealed.iv)},key,decode(sealed.cipher)));
}
async function passwordKey(password:string,salt:string) {
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:decode(salt),iterations:ROUNDS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function allTickets():StoredTicket[] {
  const raw=localStorage.getItem(SUPPORT_STORAGE_KEY);if(!raw)return [];
  try {const data=JSON.parse(raw);if(!Array.isArray(data))throw new Error();return data.filter(r=>r?.ticket?.id&&r?.ticket?.ownerId&&r?.salt&&r?.passwordKey?.cipher&&r?.adminKey?.cipher&&r?.content?.cipher);}
  catch {throw new Error('이 브라우저에 저장된 문의을 읽지 못했습니다. 브라우저 저장 설정을 확인해 주세요.');}
}
function saveTickets(rows:StoredTicket[]) {
  try {localStorage.setItem(SUPPORT_STORAGE_KEY,JSON.stringify(rows));}
  catch {throw new Error('문의 내용을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.');}
}
function findTicket(id:string) {
  const record=allTickets().find(r=>r.ticket.id===id);
  if(!record)throw new Error('문의를 찾을 수 없습니다.');return record;
}
async function managementKey() {
  let value=localStorage.getItem(ADMIN_KEY);
  if(!value){value=encode(random(32));localStorage.setItem(ADMIN_KEY,value);}
  return aes(decode(value));
}
export function demoMemberDate() {
  const existing=localStorage.getItem(MEMBER_DATE_KEY);
  if(existing&&Number.isFinite(Date.parse(existing)))return existing;
  const date=new Date().toISOString();localStorage.setItem(MEMBER_DATE_KEY,date);return date;
}

export function demoSupportGateway(current:()=>SupportMember):SupportGateway {
  const unlocked=new Map<string,Payload>();
  const requireAdmin=()=>{const member=current();if(!isDemoAdminAccount(member.demo,member.handle))throw new Error('운영자만 이 화면을 이용할 수 있습니다.');};
  const authorize=(record:StoredTicket,asAdmin:boolean)=>{
    if(asAdmin)requireAdmin();
    if(!asAdmin&&record.ticket.ownerId!==current().id)throw new Error('본인이 작성한 문의만 확인할 수 있습니다.');
  };
  const unlockAdmin=async(record:StoredTicket)=>{
    const key=await aes(await unseal(await managementKey(),record.adminKey));
    const payload=JSON.parse(new TextDecoder().decode(await unseal(key,record.content))) as Payload;
    return {key,payload};
  };
  return {
    mode:'demo',
    async access(){const member=current();return {isAdmin:isDemoAdminAccount(member.demo,member.handle)};},
    async list(asAdmin){if(asAdmin)requireAdmin();return allTickets().filter(r=>asAdmin||r.ticket.ownerId===current().id).map(r=>r.ticket).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},
    async create(draft:SupportDraft) {
      validateSupportDraft(draft);const member=current(),now=new Date().toISOString(),salt=encode(random(16)),bytes=random(32),key=await aes(bytes);
      const ticket:SupportTicket={id:crypto.randomUUID(),title:draft.title.trim(),category:draft.category,ownerId:member.id,authorId:member.handle,createdAt:now,updatedAt:now,status:'waiting'};
      const payload:Payload={body:draft.body.trim(),replies:[],member};
      const record:StoredTicket={ticket,salt,passwordKey:await seal(await passwordKey(draft.password,salt),bytes),adminKey:await seal(await managementKey(),bytes),content:await seal(key,new TextEncoder().encode(JSON.stringify(payload)))};
      saveTickets([record,...allTickets()]);return ticket.id;
    },
    async open(id,password,asAdmin):Promise<SupportConversation> {
      const record=findTicket(id);authorize(record,asAdmin);let payload:Payload;
      if(asAdmin)({payload}=await unlockAdmin(record));
      else {
        try {const key=await aes(await unseal(await passwordKey(password,record.salt),record.passwordKey));payload=JSON.parse(new TextDecoder().decode(await unseal(key,record.content)));}
        catch {throw new Error('글 비밀번호가 일치하지 않습니다.');}
      }
      unlocked.set(id,payload);return {ticket:record.ticket,body:payload.body,replies:payload.replies};
    },
    async reply(id,body,asAdmin) {
      if(!asAdmin)throw new Error('운영자만 답변을 등록할 수 있습니다.');requireAdmin();
      if(body.trim().length<2||body.length>5000)throw new Error('답변은 2~5,000자로 입력해 주세요.');
      const record=findTicket(id),{key,payload}=await unlockAdmin(record),now=new Date().toISOString();
      payload.replies.push({id:crypto.randomUUID(),authorId:'GG-O 운영자',body:body.trim(),createdAt:now});
      const next={...record,ticket:{...record.ticket,status:'answered' as const,updatedAt:now},content:await seal(key,new TextEncoder().encode(JSON.stringify(payload)))};
      saveTickets(allTickets().map(r=>r.ticket.id===id?next:r));unlocked.set(id,payload);
    },
    async member(id,ticketId,asAdmin) {
      const record=findTicket(ticketId);authorize(record,asAdmin);
      if(record.ticket.ownerId!==id)throw new Error('회원 정보를 확인할 수 없습니다.');
      if(!asAdmin&&id!==current().id)throw new Error('회원 정보를 볼 권한이 없습니다.');
      if(!asAdmin&&!unlocked.has(ticketId))throw new Error('먼저 글 비밀번호를 확인해 주세요.');
      if(id===current().id)return current();
      const {payload}=await unlockAdmin(record);return payload.member;
    },
  };
}
