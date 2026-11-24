export {};
// Supabase Edge entrypoint. Identity is verified by Auth on every request.
// IP headers have no documented trust guarantee here: do not store them.
declare const Deno:{env:{get:(name:string)=>string|undefined};serve:(handler:(request:Request)=>Promise<Response>)=>void};
const productionOrigins=new Set(['https://www.gg-o.net','https://gg-o-kculture.fitfern517.chatgpt.site']);
const allowed:Record<string,string[]>={
 'post.create':['title','body','topic','prefix_id','body_size','body_color'],'post.update':['id','title','body','topic','prefix_id','body_size','body_color'],'post.delete':['id'],
 'comment.create':['post_id','body','parent_id'],'comment.update':['id','body'],'comment.delete':['id'],
 'poll_comment.create':['poll_id','body','parent_id'],'poll_comment.update':['id','body'],'poll_comment.delete':['id']
};
export async function handleEdgeRequest(req:Request, readEnv:(name:string)=>string|undefined=(name)=>Deno.env.get(name), fetcher:typeof fetch=fetch){
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type, apikey','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(!origin||!productionOrigins.has(origin))return reply(403,{error:'GGO_ORIGIN_DENIED'});
 Object.assign(headers,{'Access-Control-Allow-Origin':origin});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'GGO_METHOD_DENIED'});
 const path=new URL(req.url).pathname.split('/').pop();if(path!=='write'&&path!=='view')return reply(404,{error:'GGO_NOT_FOUND'});
 const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return reply(401,{error:'GGO_AUTH_REQUIRED'});
 try{
  const url=readEnv('SUPABASE_URL')!,key=readEnv('SUPABASE_ANON_KEY')!,secret=readEnv('SUPABASE_SERVICE_ROLE_KEY')!;
  const userRes=await fetcher(url+'/auth/v1/user',{headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(8000)});
  if(!userRes.ok)return reply(401,{error:'GGO_AUTH_REQUIRED'});
  const user=await userRes.json();
  if(!user.id||user.is_anonymous)return reply(401,{error:'GGO_AUTH_REQUIRED'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'GGO_INVALID_INPUT'});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24576){await reader.cancel();return reply(413,{error:'GGO_INVALID_INPUT'});}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.byteLength;}
  const input=JSON.parse(new TextDecoder().decode(buffer));let rpc:string,args:Record<string,unknown>;
  if(path==='view'){
   if(!input||Object.keys(input).length!==1||typeof input.post_id!=='string'||!/^[0-9a-f-]{36}$/i.test(input.post_id))return reply(400,{error:'GGO_INVALID_INPUT'});
   // Account-based daily de-duplication; no raw identity is exposed to readers.
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.id+'|'+input.post_id+'|'+new Date().toISOString().slice(0,10)));
   rpc='anonymous_trusted_view';args={p_id:input.post_id,p_viewer_hash:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
  }else{
   if(user.app_metadata?.provider!=='google'||!user.identities?.some((i:{provider:string})=>i.provider==='google'))return reply(403,{error:'GGO_GOOGLE_REQUIRED'});
   if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['action','data'].includes(k))||typeof input.action!=='string'||!Object.hasOwn(allowed,input.action)||!input.data||typeof input.data!=='object'||Array.isArray(input.data)||Object.keys(input.data).some(k=>!allowed[input.action].includes(k))||Object.values(input.data).some(v=>v!==null&&typeof v!=='string'))return reply(400,{error:'GGO_INVALID_INPUT'});
   rpc='anonymous_trusted_write';args={p_actor:user.id,p_ip:null,p_action:input.action,p_data:input.data};
  }
  const response=await fetcher(url+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok)return reply(response.status===403?403:400,{error:['GGO_MEMBER_RESTRICTED','GGO_NOT_FOUND','GGO_VOTE_REQUIRED','GGO_RATE_LIMIT'].includes(result.message)?result.message:'GGO_WRITE_FAILED'});
  return reply(200,path==='view'?{views:result.views}:{id:result.id});
 }catch{return reply(503,{error:'GGO_SERVER_UNAVAILABLE'});}
}
if(typeof Deno!=='undefined')Deno.serve(req=>handleEdgeRequest(req));
