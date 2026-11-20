/** Legacy account identifiers for existing browser data. */
export const DEMO_ACCOUNT='AAAA';
export const DEMO_ADMIN_ACCOUNT='BBBB';
export type DemoAccount=typeof DEMO_ACCOUNT|typeof DEMO_ADMIN_ACCOUNT;
export const DEMO_LOGIN_KEY='ggo-demo-login-v1';
export function normalizeDemoAccount(value:string):DemoAccount|null {
  const account=value.trim().toUpperCase();
  return account===DEMO_ACCOUNT||account===DEMO_ADMIN_ACCOUNT?account:null;
}
export const isDemoAdminAccount=(_isDemoAccount:boolean,_label:string)=>false;
/** Keep existing AAAA ownership/votes while giving BBBB a distinct demo identity. */
export const demoOwnerKey=(account:string,deviceKey:string)=>normalizeDemoAccount(account)===DEMO_ADMIN_ACCOUNT?`${deviceKey}:BBBB`:deviceKey;
export function acceptsDemoLogin(_id:string,_password:string) {
  return false;
}
export function readDemoAccount():DemoAccount|null {
  clearDemoLogin();
  return null;
}
export const readDemoLogin=()=>false;
export function saveDemoLogin(_remember:boolean,_account:DemoAccount=DEMO_ACCOUNT) {
  clearDemoLogin();
  return false;
}
export function clearDemoLogin() {
  try {sessionStorage.removeItem(DEMO_LOGIN_KEY);}catch{}
  try {localStorage.removeItem(DEMO_LOGIN_KEY);}catch{}
}
