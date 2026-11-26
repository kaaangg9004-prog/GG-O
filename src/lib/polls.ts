import {products} from './data';
import {safeProductImage} from './catalog';
import type {LocalState,PollActor,PollBallot,PollBlock,PollComment,PollDefinition,PollOpened,PollQuestion} from './types';

export const POLL_PLACEHOLDER='/images/event-placeholder.svg';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const text=(value:unknown,max:number,min=0):value is string=>typeof value==='string'&&value.length<=max&&value.trim().length>=min;
export const safePollImage=(value:unknown):value is string=>safeProductImage(value)||(typeof value==='string'&&/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/poll-media\/[a-zA-Z0-9_.-]+$/.test(value));
export const seedPolls:PollDefinition[]=products.slice(0,3).map((product,index)=>({
  id:product.id,title:['매일 들 토트백, 어떤 색이 좋아요?','데일리 립 틴트, 어떤 색을 고를까요?','내 가방에 달 키링, 어떤 스타일이 좋아요?'][index],image:product.image,summary:'사진을 자세히 보고 나의 취향과 의견을 나눠 주세요.',revision:1,active:true,
  blocks:[{id:'intro',type:'heading',text:'함께 고르는 다음 취향'},{id:'body',type:'text',text:'색상과 디자인을 살펴보고 항목마다 가장 마음에 드는 보기 하나를 골라 주세요. 참여한 뒤에는 결과를 확인하고 익명으로 의견을 남길 수 있습니다.'},{id:'photo',type:'image',image:product.variants[1]?.image??product.image,caption:'디자인과 색상을 비교해 보세요.'}],
  questions:[
    {id:'color',prompt:'어떤 색상이 가장 마음에 드나요?',options:product.variants.map(variant=>({id:variant.id,label:variant.label}))},
    {id:'occasion',prompt:'어떤 용도로 선택하고 싶나요?',options:[{id:'daily',label:'일상에서 사용'},{id:'travel',label:'여행할 때 사용'},{id:'gift',label:'선물용으로 선택'}]},
    {id:'impression',prompt:'이 디자인에 대한 첫인상은 어떤가요?',options:[{id:'love',label:'정말 마음에 들어요'},{id:'more',label:'조금 더 보고 싶어요'},{id:'other',label:'다른 디자인이 좋아요'}]},
  ],
}));
// A meaningful poll has at least two choices per question.
for(const poll of seedPolls)if(poll.questions[0].options.length<2)poll.questions[0].options.push({id:'other-color',label:'다른 색상을 원해요'});

export function parsePoll(value:unknown):PollDefinition|null {
  if(!object(value)||!identifier(value.id)||!text(value.title,100,2)||!text(value.summary,1500)||!safePollImage(value.image)||!Number.isInteger(value.revision)||Number(value.revision)<1||!Array.isArray(value.questions)||value.questions.length<1||value.questions.length>5||!Array.isArray(value.blocks)||value.blocks.length>12||typeof value.active!=='boolean')return null;
  const questions:PollQuestion[]=[],blocks:PollBlock[]=[];
  for(const q of value.questions){
    if(!object(q)||!identifier(q.id)||!text(q.prompt,200,2)||!Array.isArray(q.options)||q.options.length<2||q.options.length>5)return null;
    const options=[];for(const option of q.options){if(!object(option)||!identifier(option.id)||!text(option.label,100,1))return null;options.push({id:option.id,label:option.label.trim()});}
    if(new Set(options.map(option=>option.id)).size!==options.length||new Set(options.map(option=>option.label.toLocaleLowerCase())).size!==options.length)return null;
    questions.push({id:q.id,prompt:q.prompt.trim(),options});
  }
  if(new Set(questions.map(q=>q.id)).size!==questions.length)return null;
  for(const block of value.blocks){
    if(!object(block)||!identifier(block.id))return null;
    if((block.type==='heading'||block.type==='text')&&text(block.text,block.type==='heading'?200:10000,1))blocks.push({id:block.id,type:block.type,text:block.text.trim()});
    else if(block.type==='image'&&safePollImage(block.image)&&text(block.caption,300))blocks.push({id:block.id,type:'image',image:block.image,caption:block.caption.trim()});else return null;
  }
  if(new Set(blocks.map(block=>block.id)).size!==blocks.length||blocks.filter(block=>block.type==='image').length>6)return null;
  return {id:value.id,title:value.title.trim(),summary:value.summary.trim(),image:value.image,revision:Number(value.revision),active:value.active,questions,blocks};
}
export function listedPolls(state:Pick<LocalState,'pollEdits'|'deletedPollIds'>):PollDefinition[]{
  const edits=state.pollEdits??[],byId=new Map(edits.map(poll=>[poll.id,poll])),removed=new Set(state.deletedPollIds??[]);
  return [...edits.filter(poll=>!seedPolls.some(seed=>seed.id===poll.id)),...seedPolls.map(poll=>byId.get(poll.id)??poll)].filter(poll=>poll.active&&!removed.has(poll.id));
}
const member=(actor:PollActor)=>{if(actor.canWrite===false)throw new Error('게시글·댓글 작성이 잠시 중단되었습니다.');if(!actor.id)throw new Error('로그인 후 이용해 주세요.');return actor.id;};
const operator=(actor:PollActor)=>{member(actor);if(!actor.isAdmin)throw new Error('운영자만 투표글을 관리할 수 있습니다.');};
export function validAnswers(poll:PollDefinition,answers:unknown):answers is Record<string,string>{
  return object(answers)&&Object.keys(answers).length===poll.questions.length&&poll.questions.every(q=>typeof answers[q.id]==='string'&&q.options.some(option=>option.id===answers[q.id]));
}
export function savePoll(state:LocalState,input:PollDefinition,actor:PollActor):LocalState {
  operator(actor);const poll=parsePoll(input);if(!poll)throw new Error('제목·사진·상세 내용과 투표 항목을 확인해 주세요. 항목은 1~3개, 보기는 항목마다 2~5개입니다.');
  const previous=listedPolls(state).find(item=>item.id===poll.id);
  if(previous&&previous.revision!==poll.revision)throw new Error('투표글이 변경되었습니다. 다시 열어 주세요.');
  if(previous&&state.pollBallots.some(vote=>vote.pollId===poll.id)&&JSON.stringify(previous.questions)!==JSON.stringify(poll.questions))throw new Error('참여자가 있는 투표의 항목과 보기는 변경할 수 없습니다. 새 투표를 등록해 주세요.');
  const saved={...poll,revision:previous?previous.revision+1:1};
  return {...state,pollEdits:[saved,...state.pollEdits.filter(item=>item.id!==poll.id)],deletedPollIds:state.deletedPollIds.filter(id=>id!==poll.id)};
}
export function removePoll(state:LocalState,id:string,actor:PollActor):LocalState {
  operator(actor);return {...state,pollEdits:state.pollEdits.filter(poll=>poll.id!==id),deletedPollIds:Array.from(new Set([...state.deletedPollIds,id])),pollBallots:state.pollBallots.filter(vote=>vote.pollId!==id),pollComments:state.pollComments.filter(comment=>comment.pollId!==id)};
}
export function castPollVote(state:LocalState,id:string,revision:number,answers:unknown,actor:PollActor):LocalState {
  const userKey=member(actor),poll=listedPolls(state).find(poll=>poll.id===id);if(!poll||poll.revision!==revision)throw new Error('투표글이 변경되었습니다. 다시 열어 주세요.');
  if(state.pollBallots.some(vote=>vote.pollId===id&&vote.userKey===userKey))throw new Error('이미 참여한 투표입니다.');
  if(!validAnswers(poll,answers))throw new Error('모든 항목에서 보기 하나씩 선택해 주세요.');
  return {...state,pollBallots:[...state.pollBallots,{pollId:id,userKey,revision,answers:{...answers},createdAt:new Date().toISOString()}]};
}
export function addPollComment(state:LocalState,id:string,value:string,actor:PollActor):LocalState {
  const userKey=member(actor);if(!listedPolls(state).some(poll=>poll.id===id)||!state.pollBallots.some(vote=>vote.pollId===id&&vote.userKey===userKey))throw new Error('투표에 참여한 뒤 익명 댓글을 남길 수 있습니다.');
  if(!text(value,1000,1))throw new Error('댓글은 1~1,000자로 입력해 주세요.');
  return {...state,pollComments:[...state.pollComments,{id:crypto.randomUUID(),pollId:id,userKey,text:value.trim(),createdAt:new Date().toISOString()}]};
}
export function openLocalPoll(state:LocalState,id:string,actor:PollActor):PollOpened {
  const userKey=actor.id,poll=listedPolls(state).find(poll=>poll.id===id);if(!poll)throw new Error('투표글을 찾을 수 없습니다.');
  const votes=state.pollBallots.filter(vote=>vote.pollId===id&&validAnswers(poll,vote.answers)),mine=votes.find(vote=>vote.userKey===userKey);
  return {poll,myVote:mine?{answers:mine.answers,createdAt:mine.createdAt}:null,results:mine?poll.questions.map(q=>({questionId:q.id,options:q.options.map(option=>({optionId:option.id,count:votes.filter(vote=>vote.answers[q.id]===option.id).length}))})):null,participants:mine?votes.length:null,comments:state.pollComments.filter(comment=>comment.pollId===id).map((c,_,all)=>({id:c.id,text:c.text,createdAt:c.createdAt,is_mine:c.userKey===actor.id,author_label:`Ẩn danh ${Array.from(new Set(all.map(c=>c.userKey))).indexOf(c.userKey)+1}`}))};
}
export function restorePollState(raw:Record<string,unknown>,state:LocalState){
  const seen=new Set<string>();if(Array.isArray(raw.pollEdits))state.pollEdits=raw.pollEdits.flatMap(value=>{const poll=parsePoll(value);if(!poll||seen.has(poll.id))return [];seen.add(poll.id);return [poll];});
  if(Array.isArray(raw.deletedPollIds))state.deletedPollIds=Array.from(new Set(raw.deletedPollIds.filter(identifier)));
  const polls=listedPolls(state),ballots:PollBallot[]=[],keys=new Set<string>();
  if(Array.isArray(raw.pollBallots))for(const value of raw.pollBallots){if(!object(value))continue;const poll=polls.find(p=>p.id===value.pollId);if(!poll||!text(value.userKey,200,1)||!validAnswers(poll,value.answers)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))continue;const key=JSON.stringify([poll.id,value.userKey]);if(keys.has(key))continue;keys.add(key);ballots.push({pollId:poll.id,userKey:value.userKey,revision:Number.isInteger(value.revision)?Number(value.revision):1,answers:{...value.answers},createdAt:value.createdAt});}
  state.pollBallots=ballots;const comments:PollComment[]=[],commentIds=new Set<string>();
  if(Array.isArray(raw.pollComments))for(const value of raw.pollComments){if(!object(value)||!text(value.id,80,1)||commentIds.has(value.id)||!text(value.text,1000,1)||!text(value.userKey,200,1)||!text(value.pollId,80,1)||!keys.has(JSON.stringify([value.pollId,value.userKey]))||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))continue;commentIds.add(value.id);comments.push({id:value.id,pollId:value.pollId,userKey:value.userKey,text:value.text,createdAt:value.createdAt});}state.pollComments=comments;
}
export const isPresetPollText=(poll:PollDefinition,value:string)=>{const seed=seedPolls.find(seed=>seed.id===poll.id);return !!seed&&JSON.stringify(seed).includes(JSON.stringify(value));};
