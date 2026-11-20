import type {SupabaseClient} from '@supabase/supabase-js';
import {LEGAL_VERSION} from './legal';

// Account-bound server record is authoritative; browser consent is only a signup draft.
export async function hasMemberConsent(client:SupabaseClient,userId:string):Promise<boolean> {
  const {data,error}=await client.from('member_consents').select('version').eq('user_id',userId).eq('version',LEGAL_VERSION).maybeSingle();
  if(error)throw new Error('가입 동의 기록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return !!data;
}
export async function acceptMemberConsent(client:SupabaseClient,userId:string):Promise<void> {
  const {error}=await client.from('member_consents').upsert({user_id:userId,version:LEGAL_VERSION},{onConflict:'user_id,version',ignoreDuplicates:true});
  if(error)throw new Error('가입 동의 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export async function completeMemberConsent(client:SupabaseClient,userId:string,explicitSignupConsent:boolean):Promise<boolean> {
  if(await hasMemberConsent(client,userId))return true;
  if(!explicitSignupConsent)return false;
  await acceptMemberConsent(client,userId);
  return true;
}
