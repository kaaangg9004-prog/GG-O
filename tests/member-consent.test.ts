import './dom-setup';
import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {completeMemberConsent} from '../src/lib/member-consent';
import {LEGAL_VERSION} from '../src/lib/legal';

test('consent follows the account on a new device, but never follows a different account',async()=>{
  const records=new Set<string>();let writes=0;
  const client={from:()=>{
    const filters:Record<string,string>={};
    const query={select:()=>query,eq:(k:string,v:string)=>{filters[k]=v;return query;},maybeSingle:async()=>({data:records.has(filters.user_id+filters.version)?{version:LEGAL_VERSION}:null,error:null}),
      upsert:async(record:{user_id:string;version:string})=>{records.add(record.user_id+record.version);writes++;return {error:null};}};return query;
  }} as unknown as SupabaseClient;
  assert.equal(await completeMemberConsent(client,'member-a',false),false);
  assert.equal(await completeMemberConsent(client,'member-a',true),true);
  localStorage.clear();sessionStorage.clear();
  assert.equal(await completeMemberConsent(client,'member-a',false),true);
  assert.equal(writes,1);
  assert.equal(await completeMemberConsent(client,'member-b',false),false);
  records.clear();records.add('member-a'+'old-version');
  assert.equal(await completeMemberConsent(client,'member-a',false),false);
});

test('database failures do not silently complete signup or look like a new member',async()=>{
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:null,error:{message:'offline'}})};
  await assert.rejects(()=>completeMemberConsent({from:()=>query} as unknown as SupabaseClient,'member-a',false),/확인하지 못했습니다/);
  const failingSave={...query,select:()=>failingSave,eq:()=>failingSave,maybeSingle:async()=>({data:null,error:null}),upsert:async()=>({error:{message:'offline'}})};
  await assert.rejects(()=>completeMemberConsent({from:()=>failingSave} as unknown as SupabaseClient,'member-a',true),/저장하지 못했습니다/);
});
