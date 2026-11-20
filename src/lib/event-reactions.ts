import type {LocalState} from './types';
import {listedEvents} from './event-catalog';
export function reactToEvent(state:LocalState,id:string,reaction:'like'|'dislike'):LocalState {
  if(!listedEvents(state).some(event=>event.id===id))return state;
  const eventReactions={...state.eventReactions};
  if(eventReactions[id]===reaction)delete eventReactions[id];else eventReactions[id]=reaction;
  return {...state,eventReactions,eventInterests:Object.keys(eventReactions).filter(id=>eventReactions[id]==='like')};
}
