import {events as seedEvents} from './data';
import {eventStatuses} from './types';
import type {CommunityEvent,LocalState} from './types';
import {safeProductImage} from './catalog';

export const EVENT_PLACEHOLDER='/images/event-placeholder.svg';
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const text=(value:unknown,max:number,min=0):value is string=>typeof value==='string'&&value.length<=max&&value.trim().length>=min;

export function parseEvent(value:unknown):CommunityEvent|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const event=value as Record<string,unknown>;
  if(!identifier(event.id)||!text(event.title,100,2)||!text(event.label,60,2)||!text(event.description,3000,3)||!text(event.location,200,2)||!safeProductImage(event.image)||!eventStatuses.includes(event.status as CommunityEvent['status']))return null;
  if(event.schedule!==undefined&&!text(event.schedule,200))return null;
  return {id:event.id,title:event.title.trim(),label:event.label.trim(),description:event.description.trim(),location:event.location.trim(),image:event.image,status:event.status as CommunityEvent['status'],...(typeof event.schedule==='string'?{schedule:event.schedule.trim()}:{})};
}

export function listedEvents(state:Pick<LocalState,'eventEdits'|'deletedEventIds'>):CommunityEvent[] {
  const edits=state.eventEdits??[],deleted=new Set(state.deletedEventIds??[]),byId=new Map(edits.map(event=>[event.id,event]));
  return [...edits.filter(event=>!seedEvents.some(seed=>seed.id===event.id)),...seedEvents.map(event=>byId.get(event.id)??event)].filter(event=>!deleted.has(event.id));
}

export function saveEvent(state:LocalState,input:CommunityEvent):LocalState {
  const event=parseEvent(input);
  if(!event)throw new Error('이벤트 제목·분류·소개·장소·진행 상태와 이미지를 확인해 주세요.');
  return {...state,eventEdits:[event,...state.eventEdits.filter(previous=>previous.id!==event.id)],deletedEventIds:state.deletedEventIds.filter(id=>id!==event.id)};
}

export function removeEvent(state:LocalState,id:string):LocalState {
  if(!listedEvents(state).some(event=>event.id===id))return state;
  const eventReactions={...state.eventReactions};delete eventReactions[id];
  return {...state,eventEdits:state.eventEdits.filter(event=>event.id!==id),deletedEventIds:Array.from(new Set([...state.deletedEventIds,id])),eventReactions,eventInterests:state.eventInterests.filter(eventId=>eventId!==id)};
}
