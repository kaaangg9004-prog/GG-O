import test from 'node:test';
import assert from 'node:assert/strict';
import {handleEdgeRequest} from '../supabase/functions/ggo-write/index';
const origin='https://gg-o-kculture.fitfern517.chatgpt.site';
const env=(n:string)=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'private-test'}[n]);
const request=(data:unknown,auth='Bearer signed-session')=>new Request('https://test.supabase.co/functions/v1/ggo-write/write',{method:'POST',headers:{Origin:origin,Authorization:auth,'Content-Type':'application/json','X-Forwarded-For':'8.8.8.8','CF-Connecting-IP':'1.1.1.1'},body:JSON.stringify(data)});
test('Supabase writer derives actor from verified Auth and never stores caller IP headers',async()=>{
 const calls:{url:string;body?:Record<string,unknown>}[]=[];
 const mock=(async(url,init)=>{calls.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):undefined});return Response.json(calls.length===1?{id:'verified-member',app_metadata:{provider:'google'},identities:[{provider:'google'}]}:{id:'created-id',private:'must not leak'});}) as typeof fetch;
 const r=await handleEdgeRequest(request({action:'post.create',data:{title:'Title',body:'Content'}}),env,mock);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:'created-id'});
 assert.equal(calls[1].body?.p_actor,'verified-member');assert.equal(calls[1].body?.p_ip,null);
});
test('Supabase writer rejects identity injection and failed authentication before database mutation',async()=>{
 let calls=0;const good=(async()=>{calls++;return Response.json({id:'member',app_metadata:{provider:'google'},identities:[{provider:'google'}]});}) as typeof fetch;
 const r=await handleEdgeRequest(request({action:'post.create',data:{title:'Title',body:'Text',user_id:'admin'}}),env,good);
 assert.equal(r.status,400);assert.equal(calls,1);
 const bad=await handleEdgeRequest(request({action:'post.create',data:{}}),env,(async()=>new Response('{}',{status:401})) as typeof fetch);
 assert.equal(bad.status,401);
 const guest=await handleEdgeRequest(request({},''),env,good);assert.equal(guest.status,401);
});
test('Supabase writer rejects an unapproved browser origin and sanitizes database errors',async()=>{
 const req=new Request('https://test.supabase.co/functions/v1/ggo-write/write',{method:'POST',headers:{Origin:'https://example.invalid'}});
 assert.equal((await handleEdgeRequest(req,env)).status,403);
 let n=0;const mock=(async()=>++n===1?Response.json({id:'member',app_metadata:{provider:'google'},identities:[{provider:'google'}]}):Response.json({message:'secret schema details',detail:'private'},{status:400})) as typeof fetch;
 const r=await handleEdgeRequest(request({action:'post.delete',data:{id:'x'}}),env,mock);assert.deepEqual(await r.json(),{error:'GGO_WRITE_FAILED'});
});
