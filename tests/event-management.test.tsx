import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import Experience from '../src/components/experience';
import {EventEditor} from '../src/components/events';
import {LocaleProvider} from '../src/components/locale-provider';
import {LanguageSwitcher} from '../src/components/language-switcher';
import {listedEvents} from '../src/lib/event-catalog';
import {readState,STORAGE_KEY} from '../src/lib/store';
import {events} from '../src/lib/data';
import type {CommunityEvent} from '../src/lib/types';
import type {Locale} from '../src/lib/i18n';

const title='직접 등록한 하노이 모임';
function fill(ui:ReturnType<typeof render>){for(const [label,value] of [['이벤트 제목 *',title],['이벤트 분류 *','문화 산책'],['이벤트 소개 *','하노이에서 만나 함께 산책하는 모임입니다.'],['장소 *','하노이 호안끼엠 (예시)'],['일정 (선택)','12월 7일 오후 2시']])fireEvent.change(ui.getByLabelText(label),{target:{value}});fireEvent.change(ui.getByLabelText('진행 상태'),{target:{value:'모집 중'}});}
function state(){return readState(localStorage.getItem(STORAGE_KEY));}
function language(ui:ReturnType<typeof render>,locale:Locale){fireEvent.click(ui.container.querySelector('.language-menu-toggle')!);fireEvent.click(ui.getByRole('menuitemradio',{name:{ko:'KOREAN',vi:'VIETNAM',en:'ENGLISH'}[locale]}));}
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});

test('a tester creates, reloads, edits and deletes an event using the card controls; cancellation and reactions work',async()=>{
  window.history.replaceState(null,'','/#events');let ui=render(<Experience authenticated accountLabel="BBBB"/>);fireEvent.click(ui.getByRole('button',{name:'이벤트 등록'}));fill(ui);fireEvent.click(ui.getByRole('button',{name:'카페 사진 선택'}));
  assert.equal(ui.getByAltText('이벤트 대표 이미지 미리보기').getAttribute('src'),'/images/cafe.jpg');fireEvent.click(ui.getByRole('button',{name:'이벤트 등록하기'}));
  await waitFor(()=>assert.ok(ui.queryByRole('dialog')===null));assert.ok(ui.getByRole('heading',{name:title}));const created=listedEvents(state()).find(event=>event.title===title)!;assert.ok(created);assert.equal(created.status,'모집 중');assert.equal(created.schedule,'12월 7일 오후 2시');
  fireEvent.click(ui.getByRole('button',{name:title+' 상세정보'}));fireEvent.click(ui.getByRole('button',{name:title+' 좋아요'}));assert.equal(state().eventReactions[created.id],'like');
  cleanup();ui=render(<Experience authenticated accountLabel="BBBB"/>);await waitFor(()=>assert.ok(ui.getByRole('heading',{name:title})));fireEvent.click(ui.getByRole('button',{name:'이벤트 목록'}));fireEvent.click(ui.getByRole('button',{name:title+' 편집'}));
  assert.equal((ui.getByLabelText('일정 (선택)') as HTMLInputElement).value,created.schedule);fireEvent.change(ui.getByLabelText('이벤트 제목 *'),{target:{value:'수정한 하노이 모임'}});fireEvent.change(ui.getByLabelText('진행 상태'),{target:{value:'종료'}});fireEvent.click(ui.getByRole('button',{name:'수정 내용 저장'}));
  assert.equal(listedEvents(state()).find(event=>event.id===created.id)?.title,'수정한 하노이 모임');assert.equal(state().eventReactions[created.id],'like');fireEvent.click(ui.getByRole('button',{name:'수정한 하노이 모임 상세정보'}));assert.equal(ui.getByRole('button',{name:'수정한 하노이 모임 좋아요'}).getAttribute('aria-pressed'),'true');fireEvent.click(ui.getByRole('button',{name:'이벤트 목록'}));
  fireEvent.click(ui.getByRole('button',{name:'수정한 하노이 모임 삭제'}));fireEvent.click(within(ui.getByRole('dialog',{name:'이벤트 삭제'})).getByRole('button',{name:'취소'}));assert.ok(ui.getByRole('heading',{name:'수정한 하노이 모임'}));
  fireEvent.click(ui.getByRole('button',{name:'수정한 하노이 모임 삭제'}));fireEvent.click(within(ui.getByRole('dialog')).getByRole('button',{name:'삭제하기'}));assert.ok(!listedEvents(state()).some(event=>event.id===created.id));assert.equal(state().eventReactions[created.id],undefined);
  cleanup();ui=render(<Experience authenticated accountLabel="BBBB"/>);assert.ok(ui.queryByRole('heading',{name:'수정한 하노이 모임'})===null);assert.equal(listedEvents(state()).length,events.length);
});

test('deleting all original events leaves a usable empty state and new registration remains available',()=>{
  window.history.replaceState(null,'','/#events');const ui=render(<Experience authenticated accountLabel="BBBB"/>);
  for(const event of events){fireEvent.click(ui.getByRole('button',{name:event.title+' 삭제'}));fireEvent.click(within(ui.getByRole('dialog')).getByRole('button',{name:'삭제하기'}));}
  assert.ok(ui.getByRole('heading',{name:'아직 등록된 이벤트가 없어요.'}));assert.equal(listedEvents(state()).length,0);fireEvent.click(ui.getAllByRole('button',{name:'이벤트 등록'})[0]);assert.ok(ui.getByRole('dialog',{name:'이벤트 등록'}));
});

test('real accounts have no local event create, edit or delete controls',()=>{
  window.history.replaceState(null,'','/#events');const ui=render(<Experience authenticated isDemoAccount={false} accountLabel="AAAA"/>);
  assert.ok(ui.queryByRole('button',{name:'이벤트 등록'})===null);for(const event of events){assert.ok(ui.queryByRole('button',{name:event.title+' 편집'})===null);assert.ok(ui.queryByRole('button',{name:event.title+' 삭제'})===null);assert.ok(ui.getByRole('button',{name:event.title+' 상세정보'}));}
});

test('event editing retains the draft, selected photo and status through all three languages',()=>{
  window.history.replaceState(null,'','/#events');const ui=render(<LocaleProvider initialLocale="ko"><LanguageSwitcher/><Experience authenticated accountLabel="BBBB"/></LocaleProvider>);fireEvent.click(ui.getByRole('button',{name:'이벤트 등록'}));fill(ui);fireEvent.change(ui.getByLabelText('이벤트 제목 *'),{target:{value:'커뮤니티'}});fireEvent.click(ui.getByRole('button',{name:'공연 사진 선택'}));const field=ui.getByLabelText('이벤트 제목 *') as HTMLInputElement,dialog=ui.getByRole('dialog');
  language(ui,'vi');assert.ok(ui.getByRole('dialog')===dialog);assert.ok(ui.getByRole('dialog',{name:'Tạo sự kiện'}));language(ui,'en');assert.ok(ui.getByLabelText('Event title *')===field);assert.equal(field.value,'커뮤니티');const status=ui.getByLabelText('Status') as HTMLSelectElement;assert.equal(status.value,'모집 중');assert.equal(status.selectedOptions[0].textContent,'Registration open');assert.equal(ui.getByAltText('Event cover image preview').getAttribute('src'),'/images/concert.jpg');
  const walker=document.createTreeWalker(dialog,4),remaining:string[]=[];let node:Node|null;while(node=walker.nextNode()){if(!node.parentElement?.closest('[translate=no],textarea')&&/[가-힣]/.test(node.textContent??''))remaining.push(node.textContent!);}assert.deepEqual(remaining,[]);
  fireEvent.click(within(dialog).getByRole('button',{name:'Create event'}));const created=listedEvents(state()).find(event=>event.title==='커뮤니티');assert.ok(created);assert.equal(created.image,'/images/concert.jpg');assert.equal(created.status,'모집 중');assert.ok(ui.getByRole('heading',{name:'커뮤니티'}));
  language(ui,'ko');assert.ok(ui.getByRole('button',{name:'커뮤니티 편집'}));
});

test('failed event saving retains every field and can be retried without closing the editor',()=>{
  let accept=false,saved:CommunityEvent|undefined;const ui=render(<EventEditor onCancel={()=>{}} onSave={event=>{saved=event;return accept;}}/>);fill(ui);fireEvent.click(ui.getByRole('button',{name:'모임 사진 선택'}));fireEvent.click(ui.getByRole('button',{name:'이벤트 등록하기'}));assert.ok(ui.getByRole('alert'));assert.equal((ui.getByLabelText('이벤트 제목 *') as HTMLInputElement).value,title);assert.equal(saved?.image,'/images/friends.jpg');accept=true;fireEvent.click(ui.getByRole('button',{name:'이벤트 등록하기'}));assert.ok(ui.queryByRole('alert')===null);assert.equal(saved?.status,'모집 중');
});
