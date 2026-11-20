import {getSupabase} from './supabase-service';
import {EMERGENCY_CONSENT_VERSION,validateEmergencyDraft} from './emergency';
import type {EmergencyAccess,EmergencyDraft,EmergencyGateway,EmergencyRecord,EmergencySummary} from './emergency';

export interface EmergencyTransport {
  user():Promise<{id:string}|null>;
  call(name:string,args?:Record<string,unknown>):Promise<{data:unknown;error:{message:string}|null}>;
}
function transport():EmergencyTransport|null {
  const client=getSupabase();if(!client)return null;
  return {
    async user(){const {data,error}=await client.auth.getUser();if(error)return null;return data.user;},
    async call(name,args){const {data,error}=await client.rpc(name,args);return {data,error};},
  };
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

/** Production-only gateway: there is deliberately no demo administrator,
 * browser database, client role override, or success-on-failure path. */
export function emergencyGateway(connection:EmergencyTransport|null=transport()):EmergencyGateway {
  async function call(name:string,args?:Record<string,unknown>) {
    if(!connection)throw new Error('현재 운영자 접수 서버가 연결되지 않아 메시지를 보낼 수 없습니다.');
    if(!await connection.user())throw new Error('요청을 보내려면 회원 계정으로 로그인해 주세요.');
    const {data,error}=await connection.call(name,args);
    if(error)throw new Error(/[가-힣]/.test(error.message)?error.message:'접수 서버에 연결하지 못했습니다. 전송 완료 여부를 확인하지 못했으니 다시 시도해 주세요.');
    return data;
  }
  async function access():Promise<EmergencyAccess> {
    const data=await call('emergency_service_status');
    if(!object(data)||typeof data.enabled!=='boolean'||typeof data.isAdmin!=='boolean'||typeof data.consentVersion!=='string')throw new Error('접수 서버 설정을 확인하지 못했습니다.');
    return {enabled:data.enabled,isAdmin:data.isAdmin,consentVersion:data.consentVersion};
  }
  async function requireAdmin(){if(!(await access()).isAdmin)throw new Error('운영자만 확인할 수 있는 게시판입니다.');}
  return {
    access,
    async submit(draft:EmergencyDraft,requestId:string) {
      validateEmergencyDraft(draft);
      if(!uuid(requestId))throw new Error('요청 번호를 확인하지 못했습니다. 창을 다시 열어 주세요.');
      const state=await access();
      if(!state.enabled||state.consentVersion!==EMERGENCY_CONSENT_VERSION)throw new Error('현재 긴급 요청 접수가 준비 중입니다. 메시지는 전송되지 않았습니다.');
      const result=await call('submit_emergency_request',{p_request_id:requestId,p_name:draft.name.trim(),p_phone:draft.phone.trim(),p_email:draft.email.trim(),p_location:draft.location.trim(),p_body:draft.body.trim(),p_consent:draft.consent,p_consent_version:draft.consentVersion});
      if(!object(result)||!uuid(result.id))throw new Error('접수 완료를 확인하지 못했습니다. 같은 창에서 다시 시도해 주세요.');
      return {id:result.id};
    },
    async list(status){await requireAdmin();const data=await call('list_emergency_requests',{p_status:status});if(!Array.isArray(data))throw new Error('접수 목록을 확인하지 못했습니다.');return data as EmergencySummary[];},
    async open(id){await requireAdmin();const data=await call('open_emergency_request',{p_id:id});if(!object(data)||data.id!==id)throw new Error('요청을 찾을 수 없습니다.');return data as unknown as EmergencyRecord;},
    async resolve(id){await requireAdmin();await call('resolve_emergency_request',{p_id:id});},
  };
}
