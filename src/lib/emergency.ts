/** Emergency requests are never saved in local/session storage. */
export const EMERGENCY_CONSENT_VERSION='2026-11-14-emergency-v1';
export const emergencyPrivacyNotice={
  controller:'GG-O 운영자',
  purpose:'한국 여행 중 도움 요청 확인, 상황 파악 및 요청자에게 연락',
  items:'이름, 연락처, 이메일 주소, 직접 입력한 현위치, 요청 내용',
  retention:'처리 완료 후 30일 이내 파기하며, 접수일로부터 최대 90일까지만 보관합니다.',
  refusal:'동의를 거부할 수 있으나, 동의하지 않으면 도움 요청을 보낼 수 없습니다.',
  rights:'동의 철회·열람·삭제 요청: contact.us.ggo@gmail.com',
} as const;
export interface EmergencyDraft {
  name:string; phone:string; email:string; location:string; body:string;
  consent:boolean; consentVersion:string;
}
export type EmergencyState='new'|'viewed'|'resolved';
export interface EmergencySummary {id:string; name:string; createdAt:string; status:EmergencyState}
export interface EmergencyRecord extends EmergencySummary {
  phone:string; email:string; location:string; body:string;
  consentVersion:string; consentedAt:string; expiresAt:string;
}
export interface EmergencyAccess {enabled:boolean; isAdmin:boolean; consentVersion:string}
export interface EmergencyGateway {
  access():Promise<EmergencyAccess>;
  submit(draft:EmergencyDraft,requestId:string):Promise<{id:string}>;
  list(status:'all'|EmergencyState):Promise<EmergencySummary[]>;
  open(id:string):Promise<EmergencyRecord>;
  resolve(id:string):Promise<void>;
}
export function validateEmergencyDraft(draft:EmergencyDraft) {
  if(!draft.consent||draft.consentVersion!==EMERGENCY_CONSENT_VERSION)throw new Error('개인정보 수집·이용 안내를 확인하고 동의해 주세요.');
  if(draft.name.trim().length<1||draft.name.length>80)throw new Error('이름을 80자 이내로 입력해 주세요.');
  const digits=draft.phone.replace(/\D/g,'');
  if(draft.phone.length>40||digits.length<6||digits.length>20||!/^[+0-9\s().-]+$/.test(draft.phone))throw new Error('국가번호를 포함해 연락 가능한 전화번호를 입력해 주세요.');
  if(draft.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))throw new Error('이메일 주소를 확인해 주세요.');
  if(draft.location.trim().length<2||draft.location.length>500)throw new Error('현위치를 2~500자로 입력해 주세요.');
  if(draft.body.trim().length<10||draft.body.length>5000)throw new Error('요청 내용은 10~5,000자로 입력해 주세요.');
}
