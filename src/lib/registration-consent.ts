import {LEGAL_VERSION} from './legal';
export const CONSENT_KEY='ggo-registration-consent-v1';
export interface RegistrationConsent {version:string;accepted:boolean;acceptedAt:string|null;updatedAt:string}
export function readRegistrationConsent():RegistrationConsent|null {
  try {
    const raw=localStorage.getItem(CONSENT_KEY);if(!raw)return null;
    const data=JSON.parse(raw);
    if(data?.version!==LEGAL_VERSION||typeof data.accepted!=='boolean'||typeof data.updatedAt!=='string')return null;
    if(data.accepted&&(typeof data.acceptedAt!=='string'||!Number.isFinite(Date.parse(data.acceptedAt))))return null;
    return {version:LEGAL_VERSION,accepted:data.accepted,acceptedAt:data.acceptedAt??null,updatedAt:data.updatedAt};
  }catch{return null;}
}
export const hasRegistrationConsent=()=>readRegistrationConsent()?.accepted===true;
export function saveRegistrationConsent(accepted:boolean):RegistrationConsent {
  const now=new Date().toISOString();
  const record={version:LEGAL_VERSION,accepted,acceptedAt:accepted?now:null,updatedAt:now};
  localStorage.setItem(CONSENT_KEY,JSON.stringify(record));return record;
}
