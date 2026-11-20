import {getSupabase} from './supabase-service';
import {anonymousGateway} from './anonymous-service';
import {parsePoll,safePollImage,validAnswers} from './polls';
import type {PollDefinition,PollOpened,PollSummary} from './types';
export interface PollGateway {list:()=>Promise<PollSummary[]>;open:(id:string)=>Promise<PollOpened>;vote:(id:string,revision:number,answers:Record<string,string>)=>Promise<PollOpened>;comment:(id:string,text:string)=>Promise<PollOpened>;save:(poll:PollDefinition)=>Promise<void>;remove:(id:string)=>Promise<void>}
export function pollGateway():PollGateway|null {
  const client=getSupabase();if(!client)return null;
  const call=async(name:string,args?:Record<string,unknown>,authenticated=true)=>{
    if(authenticated){const {data,error}=await client.auth.getUser();if(error||!data.user)throw new Error('로그인 후 이용해 주세요.');}
    const {data,error}=await client.rpc(name,args);if(error)throw new Error(/[가-힣]/.test(error.message)?error.message:'투표 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');return data;
  };
  const opened=(data:unknown):PollOpened=>{
    const invalid=()=>{throw new Error('투표 내용을 불러오지 못했습니다.');};
    if(!data||typeof data!=='object')return invalid();const value=data as PollOpened,poll=parsePoll(value.poll);if(!poll||!Array.isArray(value.comments))return invalid();
    const comments=value.comments.map(comment=>{if(!comment||typeof comment.id!=='string'||typeof comment.text!=='string'||comment.text.length>1000||!Number.isFinite(Date.parse(comment.createdAt)))return invalid();return {id:comment.id,text:comment.text,createdAt:comment.createdAt,author_label:comment.author_label,is_mine:comment.is_mine};});
    if(value.myVote===null){if(value.results!==null||value.participants!==null)return invalid();return {poll,myVote:null,results:null,participants:null,comments,questionsLocked:value.questionsLocked===true};}
    if(!value.myVote||!validAnswers(poll,value.myVote.answers)||!Number.isFinite(Date.parse(value.myVote.createdAt))||!Number.isInteger(value.participants)||Number(value.participants)<1||!Array.isArray(value.results)||value.results.length!==poll.questions.length)return invalid();
    const results=poll.questions.map(q=>{const result=value.results!.find(result=>result.questionId===q.id);if(!result||result.options.length!==q.options.length)return invalid();const options=q.options.map(option=>{const count=result.options.find(item=>item.optionId===option.id)?.count;if(!Number.isInteger(count)||Number(count)<0||Number(count)>Number(value.participants))return invalid();return {optionId:option.id,count:Number(count)};});if(options.reduce((sum,item)=>sum+item.count,0)!==value.participants)return invalid();return {questionId:q.id,options};});
    return {poll,myVote:{answers:{...value.myVote.answers},createdAt:value.myVote.createdAt},results,participants:Number(value.participants),comments,questionsLocked:value.questionsLocked===true};
  };
  const image=async(source:string)=>{
    if(!source.startsWith('data:'))return source;
    const blob=await (await fetch(source)).blob(),name=crypto.randomUUID()+'.webp';
    const {error}=await client.storage.from('poll-media').upload(name,blob,{contentType:blob.type,upsert:false});if(error)throw new Error('사진을 등록하지 못했습니다.');
    return client.storage.from('poll-media').getPublicUrl(name).data.publicUrl;
  };
  return {
    list:async()=>{const data=await call('poll_summaries',undefined,false);if(!Array.isArray(data)||data.some(value=>!value||typeof value.id!=='string'||typeof value.title!=='string'||!safePollImage(value.image)))throw new Error('투표 목록을 불러오지 못했습니다.');return data.map(value=>({id:value.id,title:value.title,image:value.image}));},
    open:async id=>opened(await call('poll_open',{p_id:id},false)),
    vote:async(id,revision,answers)=>opened(await call('poll_vote',{p_id:id,p_revision:revision,p_answers:answers})),
    comment:async(id,text)=>{await anonymousGateway()!.write('poll_comment.create',{poll_id:id,body:text});return opened(await call('poll_open',{p_id:id},false));},
    save:async poll=>{const copy={...poll,image:await image(poll.image),blocks:await Promise.all(poll.blocks.map(async block=>block.type==='image'?{...block,image:await image(block.image)}:block))};await call('poll_save',{p_document:copy,p_expected_revision:poll.revision});},
    remove:async id=>{await call('poll_remove',{p_id:id});},
  };
}
