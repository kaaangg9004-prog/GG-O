import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import DemoAccess from '../src/components/demo-access';
import Experience from '../src/components/experience';
import {PollEditor} from '../src/components/polls';
import {LocaleProvider} from '../src/components/locale-provider';
import {LanguageSwitcher} from '../src/components/language-switcher';
import {articles,events,seedPosts} from '../src/lib/data';
import {listedPolls,seedPolls} from '../src/lib/polls';
import {readState,STORAGE_KEY} from '../src/lib/store';
import type {PollDefinition} from '../src/lib/types';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});
async function login(ui:ReturnType<typeof render>){if(!ui.queryByRole('dialog',{name:'로그인'}))fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'로그인'}));const form=within(ui.getByRole('dialog',{name:'로그인'}));fireEvent.change(form.getByLabelText('아이디'),{target:{value:'AAAA'}});fireEvent.change(form.getByLabelText('비밀번호',{exact:true}),{target:{value:'0000'}});fireEvent.click(form.getByRole('button',{name:'로그인'}));await waitFor(()=>assert.ok(ui.queryByRole('dialog',{name:'로그인'})===null));}
const navigation=(ui:ReturnType<typeof render>)=>within(ui.getByRole('navigation',{name:'주 메뉴'}));

test('the public homepage loads without a login screen and shows plain header login/signup links',()=>{
  const ui=render(<DemoAccess/>);assert.ok(ui.container.querySelector('.home-intro'));assert.ok(ui.queryByRole('dialog')===null);const header=within(ui.getByRole('banner'));assert.ok(header.getByRole('button',{name:'로그인'}));assert.equal(header.getByRole('link',{name:'회원가입'}).getAttribute('href'),'/signup/');assert.deepEqual(navigation(ui).getAllByRole('link').map(link=>link.textContent),['홈','소식','커뮤니티','투표','이벤트']);assert.ok(ui.queryByRole('button',{name:'장바구니'})===null);
});

test('guests read posts and comments publicly while writing still requires authentication',async()=>{
 const ui=render(<DemoAccess/>);fireEvent.click(navigation(ui).getByRole('link',{name:'커뮤니티'}));
 fireEvent.click(ui.container.querySelector('.recent-story')!);
 assert.ok(ui.getByRole('dialog',{name:'익명 게시판'}));assert.equal(ui.queryByRole('dialog',{name:'로그인'}),null);
 assert.ok(ui.container.querySelector('.board-body'));assert.equal(ui.queryByLabelText('익명으로 댓글 쓰기'),null);
 fireEvent.click(ui.getByRole('button',{name:'로그인 후 댓글을 작성할 수 있습니다.'}));await login(ui);
 assert.ok(ui.getByLabelText('익명으로 댓글 쓰기'));
});
test('home and community expose TOP plus separately labelled recent stories without a login wall',()=>{
 for(const route of ['/','/#community']){cleanup();localStorage.clear();window.history.replaceState(null,'',route);const ui=render(<DemoAccess/>);
 assert.ok(ui.getByRole('region',{name:'최근 올라온 글'}));assert.equal(ui.container.querySelector('.top-ranking-score'),null);
 fireEvent.click(ui.container.querySelector('.recent-story')!);assert.ok(ui.getByRole('dialog',{name:'익명 게시판'}));assert.equal(ui.queryByRole('dialog',{name:'로그인'}),null);}
});
test('event information and magazine bodies are public; private support remains protected',()=>{
 const ui=render(<DemoAccess/>);fireEvent.click(navigation(ui).getByRole('link',{name:'이벤트'}));assert.equal(ui.queryByRole('dialog'),null);assert.ok(ui.getByText(events[0].description));
 fireEvent.click(navigation(ui).getByRole('link',{name:'홈'}));fireEvent.click(ui.container.querySelector('.journal-card')!);assert.ok(ui.getByText(articles[0].paragraphs[0]));
 fireEvent.click(ui.getByRole('button',{name:'닫기'}));fireEvent.click(ui.getByRole('button',{name:'고객지원'}));assert.ok(ui.getByRole('dialog',{name:'로그인'}));
 assert.equal(navigation(ui).queryByRole('link',{name:'긴급'}),null);assert.ok(ui.getByRole('button',{name:'도움 안내'}));
});
test('guests preview poll questions and choices; submitting requires login and never stores a guest ballot',async()=>{
 for(const home of [false,true]){cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'',home?'/':'/#polls');const ui=render(<DemoAccess/>);
 fireEvent.click(ui.container.querySelector('.poll-card-open')!);assert.ok(ui.getByRole('dialog',{name:'투표 상세'}));assert.equal(ui.queryByRole('dialog',{name:'로그인'}),null);
 for(const group of ui.container.querySelectorAll('.poll-question'))fireEvent.click(group.querySelector('input')!);
 fireEvent.click(ui.getByRole('button',{name:'참여'}));assert.ok(ui.getByRole('dialog',{name:'로그인'}));assert.equal(readState(localStorage.getItem(STORAGE_KEY)).pollBallots.length,0);
 await login(ui);assert.ok(ui.getByRole('dialog',{name:'투표 상세'}));fireEvent.click(ui.getByRole('button',{name:'참여'}));await waitFor(()=>assert.ok(ui.getByText('참여를 완료했습니다.')));assert.equal(readState(localStorage.getItem(STORAGE_KEY)).pollBallots.length,1);}
});

test('one radio choice per question and a complete ballot are required; results replace options and unlock anonymous comments',async()=>{
  window.history.replaceState(null,'','/#polls');let ui=render(<Experience authenticated/>);fireEvent.click(ui.container.querySelector('.poll-card-open')!);const dialog=within(ui.getByRole('dialog',{name:'투표 상세'}));const submit=dialog.getByRole('button',{name:'참여'}) as HTMLButtonElement;assert.equal(submit.disabled,true);
  const groups=ui.container.querySelectorAll('.poll-question');for(const group of groups){const inputs=group.querySelectorAll<HTMLInputElement>('input[type=radio]');fireEvent.click(inputs[0]);fireEvent.click(inputs[1]);assert.equal(inputs[0].checked,false);assert.equal(inputs[1].checked,true);}assert.equal(submit.disabled,false);fireEvent.click(submit);await waitFor(()=>assert.ok(dialog.getByText('참여를 완료했습니다.')));assert.equal(dialog.queryAllByRole('radio').length,0);assert.equal(ui.container.querySelectorAll('.poll-result.my-choice').length,3);assert.equal(readState(localStorage.getItem(STORAGE_KEY)).pollBallots.length,1);
  fireEvent.change(dialog.getByRole('textbox',{name:'익명으로 의견 남기기'}),{target:{value:'커뮤니티'}});fireEvent.click(dialog.getByRole('button',{name:'댓글 등록'}));await waitFor(()=>assert.ok(dialog.getByText('커뮤니티',{exact:true})));assert.ok(dialog.getByText('익명 1',{exact:true}));
  cleanup();ui=render(<Experience authenticated/>);fireEvent.click(ui.container.querySelector('.poll-card-open')!);assert.ok(ui.getByText('참여를 완료했습니다.'));assert.equal(ui.queryAllByRole('radio').length,0);assert.equal(ui.container.querySelector('.poll-comment p')?.textContent,'커뮤니티');
});

test('only the operator sees poll registration and editing, and legacy store routes lead to polls',()=>{
  window.history.replaceState(null,'','/#shop');const ui=render(<Experience authenticated accountLabel="AAAA"/>);assert.equal(window.location.hash,'#polls');assert.ok(ui.queryByRole('button',{name:'투표글 등록'})===null);assert.equal(ui.container.querySelector('.poll-card-ops'),null);assert.ok(ui.queryByRole('button',{name:'상품 관리'})===null);
});

test('the operator can compose detail blocks, reorder them, preview a big page, set question count and save',async()=>{
  let saved:PollDefinition|undefined;const ui=render(<PollEditor onCancel={()=>{}} onSave={async poll=>{saved=poll;return true;}}/>);fireEvent.change(ui.getByLabelText('투표 이름 *'),{target:{value:'새로 만든 취향 투표'}});fireEvent.click(ui.getByRole('button',{name:'토트백 사진'}));fireEvent.change(ui.getByLabelText('투표 항목 수'),{target:{value:'1'}});fireEvent.change(ui.getByLabelText('질문 *'),{target:{value:'가장 좋아하는 색상은?'}});const choices=ui.getAllByRole('textbox').filter(field=>field.closest('.poll-editor-option'));fireEvent.change(choices[0],{target:{value:'검정'}});fireEvent.change(choices[1],{target:{value:'흰색'}});
  for(let i=0;i<3;i++)fireEvent.click(ui.getByRole('button',{name:'보기 추가'}));assert.equal((ui.getByRole('button',{name:'보기 추가'}) as HTMLButtonElement).disabled,true);for(const [index,field] of ui.getAllByRole('textbox').filter(field=>field.closest('.poll-editor-option')).entries())if(index>1)fireEvent.change(field,{target:{value:'추가 색상 '+index}});
  fireEvent.click(ui.getByRole('button',{name:'제목 추가'}));fireEvent.change(ui.getByLabelText('상세 제목'),{target:{value:'커뮤니티'}});fireEvent.click(ui.getByRole('button',{name:'본문 추가'}));fireEvent.change(ui.getByLabelText('상세 본문'),{target:{value:'직접 꾸미는 상세 페이지 설명입니다.'}});fireEvent.click(ui.getByRole('button',{name:'블록 2 위로'}));fireEvent.click(ui.getByRole('button',{name:'상세페이지 미리보기'}));assert.ok(ui.getByAltText('투표 상품 큰 사진'));assert.ok(ui.getByRole('heading',{name:'커뮤니티'}));assert.ok(ui.getByText('직접 꾸미는 상세 페이지 설명입니다.'));fireEvent.click(ui.getByRole('button',{name:'투표글 등록하기'}));await waitFor(()=>assert.ok(saved));assert.equal(saved?.questions.length,1);assert.equal(saved?.questions[0].options.length,5);assert.equal(saved?.blocks[0].type,'text');
});

test('language changes preserve a poll ballot draft and translate the branded login popup',()=>{
  window.history.replaceState(null,'','/#polls');const ui=render(<LocaleProvider initialLocale="ko"><LanguageSwitcher/><Experience authenticated/></LocaleProvider>);fireEvent.click(ui.container.querySelector('.poll-card-open')!);const first=ui.getAllByRole('radio')[0] as HTMLInputElement;fireEvent.click(first);fireEvent.click(ui.container.querySelector('.language-menu-toggle')!);fireEvent.click(ui.getByRole('menuitemradio',{name:'ENGLISH'}));assert.ok(first.checked);assert.ok(ui.getByRole('button',{name:'Participate'}));
  cleanup();localStorage.clear();window.history.replaceState(null,'','/');const guest=render(<LocaleProvider initialLocale="ko"><LanguageSwitcher/><DemoAccess/></LocaleProvider>);fireEvent.click(within(guest.getByRole('banner')).getByRole('button',{name:'로그인'}));fireEvent.click(guest.container.querySelector('.language-menu-toggle')!);fireEvent.click(guest.getByRole('menuitemradio',{name:'VIETNAM'}));assert.ok(within(guest.getByRole('dialog')).getByText('Văn hóa Hàn · Vui chơi · Cộng đồng'));assert.ok(guest.queryByRole('heading',{name:/로그인/})===null);
});

test('an operator can edit the rich details of a voted poll while choices stay locked, then delete it persistently',async()=>{
  window.history.replaceState(null,'','/#polls');let ui=render(<Experience authenticated accountLabel="BBBB"/>);fireEvent.click(ui.container.querySelector('.poll-card-open')!);for(const group of ui.container.querySelectorAll('.poll-question'))fireEvent.click(group.querySelector('input')!);fireEvent.click(ui.getByRole('button',{name:'참여'}));await waitFor(()=>assert.ok(ui.getByText('참여를 완료했습니다.')));fireEvent.click(ui.getByRole('button',{name:'닫기'}));
  fireEvent.click(ui.getByRole('button',{name:seedPolls[0].title+' 편집'}));assert.equal((ui.getByLabelText('투표 항목 수') as HTMLSelectElement).disabled,true);for(const input of ui.container.querySelectorAll<HTMLInputElement>('.poll-editor-question input'))assert.equal(input.matches(':disabled'),true);fireEvent.change(ui.getByLabelText('투표 이름 *'),{target:{value:'새로 다듬은 투표 상세'}});fireEvent.change(ui.getByLabelText('상세 제목'),{target:{value:'직접 꾸민 상세 제목'}});fireEvent.click(ui.getByRole('button',{name:'수정 내용 저장'}));await waitFor(()=>assert.ok(ui.queryByRole('dialog')===null));
  fireEvent.click(ui.getByRole('button',{name:'새로 다듬은 투표 상세'}));assert.ok(ui.getByRole('heading',{name:'직접 꾸민 상세 제목'}));assert.ok(ui.getByText('참여를 완료했습니다.'));fireEvent.click(ui.getByRole('button',{name:'닫기'}));fireEvent.click(ui.getByRole('button',{name:'새로 다듬은 투표 상세 삭제'}));fireEvent.click(ui.getByRole('button',{name:'삭제하기'}));await waitFor(()=>assert.ok(ui.queryByRole('dialog')===null));
  cleanup();ui=render(<Experience authenticated accountLabel="BBBB"/>);assert.ok(ui.queryByRole('button',{name:'새로 다듬은 투표 상세'})===null);assert.ok(!listedPolls(readState(localStorage.getItem(STORAGE_KEY))).some(poll=>poll.id===seedPolls[0].id));
});

test('logout keeps saved ballots private while public poll previews remain available',async()=>{
 window.history.replaceState(null,'','/#polls');const ui=render(<DemoAccess/>);await login(ui);fireEvent.click(ui.container.querySelector('.poll-card-open')!);
 for(const group of ui.container.querySelectorAll('.poll-question'))fireEvent.click(group.querySelector('input')!);fireEvent.click(ui.getByRole('button',{name:'참여'}));await waitFor(()=>assert.ok(ui.getByText('참여를 완료했습니다.')));
 fireEvent.click(ui.getByRole('button',{name:'닫기'}));fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:'로그아웃'}));fireEvent.click(ui.container.querySelector('.poll-card-open')!);
 assert.ok(ui.getByRole('dialog',{name:'투표 상세'}));assert.equal(ui.queryByText('참여를 완료했습니다.'),null);assert.ok(ui.getAllByRole('radio').length>0);assert.equal(readState(localStorage.getItem(STORAGE_KEY)).pollBallots.length,1);
});
