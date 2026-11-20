import {isDemoAdminAccount} from './demo-login';
import {validateEmergencyDraft} from './emergency';
import type {EmergencyDraft,EmergencyRecord} from './emergency';

/** UI testing only; this never grants a role in the real support service. */
export const canUseEmergencyDemoInbox=isDemoAdminAccount;
export interface EmergencyDemoRecord extends Omit<EmergencyRecord,'expiresAt'> {demo:true}
export function makeEmergencyDemoRecord(draft:EmergencyDraft):EmergencyDemoRecord {
  validateEmergencyDraft(draft);const now=new Date();
  return {id:`test-${crypto.randomUUID()}`,demo:true,name:draft.name.trim(),phone:draft.phone.trim(),email:draft.email.trim(),location:draft.location.trim(),body:draft.body.trim(),
    status:'new',createdAt:now.toISOString(),consentedAt:now.toISOString(),consentVersion:draft.consentVersion};
}
