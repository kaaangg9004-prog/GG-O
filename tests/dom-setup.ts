import {JSDOM} from 'jsdom';
export const dom=new JSDOM('<!doctype html><html lang="ko"><body></body></html>',{url:'https://test.example/',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','Event','MouseEvent','KeyboardEvent','File','FileReader','localStorage','sessionStorage']) {
  Object.defineProperty(globalThis,key,{value:(dom.window as unknown as Record<string,unknown>)[key],configurable:true,writable:true});
}
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{value:true,writable:true});
dom.window.scrollTo=()=>{};
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
dom.window.matchMedia=(query:string)=>({matches:false,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}});
