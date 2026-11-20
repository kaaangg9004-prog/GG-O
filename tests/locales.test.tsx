import {seedPolls} from '../src/lib/polls';
import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {LocaleProvider} from '../src/components/locale-provider';
import {LanguageSwitcher} from '../src/components/language-switcher';
import Experience from '../src/components/experience';
import DemoAccess from '../src/components/demo-access';
import Signup from '../src/components/signup';
import {HomeHero} from '../src/components/home-hero';
import {ProductDetail,Composer,CartPanel} from '../src/components/panels';
import {BoardDetail} from '../src/components/board';
import {EmergencyPage} from '../src/components/emergency';
import {LegalDocument} from '../src/components/legal-document';
import {products,seedPosts} from '../src/lib/data';
import {LOCALE_KEY,translateText,localizedImage} from '../src/lib/i18n';
import type {Locale} from '../src/lib/i18n';
import type {Post} from '../src/lib/types';
import {readState} from '../src/lib/store';

const names={vi:['Trang chủ','Tin tức','Cộng đồng','Bình chọn','Sự kiện'],en:['Home','News','Community','Polls','Events'],ko:['홈','소식','커뮤니티','투표','이벤트']};
const labels={vi:'VIETNAM',en:'ENGLISH',ko:'KOREAN'};
const t=(value:string,locale:Locale)=>translateText(value,locale);
function app(child:React.ReactNode,locale?:Locale){return render(<LocaleProvider initialLocale={locale}><LanguageSwitcher/>{child}</LocaleProvider>);}
function select(ui:ReturnType<typeof render>,locale:Locale){fireEvent.click(ui.container.querySelector('.language-menu-toggle')!);fireEvent.click(ui.getByRole('menuitemradio',{name:labels[locale]}));}
function untranslated(root:HTMLElement){const values=new Set<string>();const walker=document.createTreeWalker(root,4);let node:Node|null;while(node=walker.nextNode()){const element=node.parentElement;if(element?.closest('[translate=no],textarea,code'))continue;const text=node.textContent?.trim()??'';if(/[가-힣]/.test(text))values.add(text);}return [...values];}
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');document.documentElement.lang='ko';});

test('default Vietnamese, Korean/Vietnamese quick switch and English menu persist the chosen language',()=>{
  let ui=app(<HomeHero onCommunity={()=>{}} onPolls={()=>{}}/>);
  assert.equal(document.documentElement.lang,'vi');assert.equal(ui.container.querySelector('.home-intro h1')?.textContent,t('한국 문화부터 일상까지,','vi')+t('함께 이야기해요.','vi'));
  let quick=ui.container.querySelector<HTMLButtonElement>('.language-quick-switch')!;assert.match(quick.textContent!,/KOREAN/);assert.equal(quick.querySelector('img')?.getAttribute('src'),'/images/flag-kr.svg');fireEvent.click(quick);
  assert.equal(document.documentElement.lang,'ko');assert.equal(ui.container.querySelector('.home-intro h1')?.textContent,'한국 문화부터 일상까지,함께 이야기해요.');assert.match(quick.textContent!,/VIETNAM/);assert.equal(quick.querySelector('img')?.getAttribute('src'),'/images/flag-vn.svg');
  fireEvent.click(quick);select(ui,'en');assert.equal(document.documentElement.lang,'en');assert.equal(ui.container.querySelector('.home-intro h1')?.textContent,'From Korean culture to everyday life,let’s talk together.');assert.equal(localStorage.getItem(LOCALE_KEY),'en');
  cleanup();ui=app(<HomeHero onCommunity={()=>{}} onPolls={()=>{}}/>);assert.equal(document.documentElement.lang,'en');assert.ok(ui.getByRole('button',{name:'Explore polls'}));
});

test('both poster copy and embedded product-image lettering follow all three languages',()=>{
  const ui=app(<HomeHero onCommunity={()=>{}} onPolls={()=>{}}/>,'ko');
  for(const locale of ['vi','en','ko'] as const){select(ui,locale);const poster=ui.container.querySelector<HTMLElement>('.home-intro')!;if(locale!=='ko')assert.deepEqual(untranslated(poster),[]);else assert.match(poster.textContent!,/한국 문화부터 일상까지,/);}
  const sources=['tote','tote-black','pouch','pouch-black','tint','tint-peach','tint-cherry'];
  for(const name of sources)for(const locale of ['vi','en'] as const){const path=localizedImage(`/images/${name}.svg`,locale);assert.ok(existsSync('public'+path));const source=readFileSync('public'+path,'utf8');assert.ok(!/[가-힣]/.test(source),path);assert.match(source,/GG-O/);assert.equal((source.match(/<text\b/g)??[]).length,(readFileSync(`public/images/${name}.svg`,'utf8').match(/<text\b/g)??[]).length);}
  for(const flag of ['kr','vn','gb'])assert.match(readFileSync(`public/images/flag-${flag}.svg`,'utf8'),/<svg/);
});

test('desktop and mobile navigation keep identical order and all major screens have translated UI',async()=>{
  for(const locale of ['vi','en'] as const){
    for(const route of ['home','news','polls','community','journal','events','my','favorites','admin','catalog','support','emergency','emergency-admin']){
      cleanup();localStorage.removeItem(LOCALE_KEY);window.history.replaceState(null,'','/#'+route);const ui=app(<Experience authenticated accountLabel="BBBB"/>,locale);
      await waitFor(()=>assert.ok(ui.queryByText(t('문의를 불러오고 있어요.',locale))===null));
      assert.deepEqual(Array.from(ui.container.querySelectorAll('.header-inner>nav>a')).map(link=>link.textContent),names[locale]);assert.deepEqual(Array.from(ui.container.querySelectorAll('.bottom-nav>button')).map(button=>button.textContent),names[locale]);
      assert.deepEqual(untranslated(ui.container),[],`${locale} / ${route}`);assert.ok(!/[가-힣]/.test(document.title),document.title);
    }
  }
});

test('a community draft survives language changes and translated categories submit their original stable values',()=>{
  let saved:Post|undefined;const ui=app(<Composer ownerKey="demo" onSubmit={post=>{saved=post;}}/>,'ko');
  const title=ui.getByLabelText('제목') as HTMLInputElement,body=ui.getByLabelText('내용') as HTMLTextAreaElement,category=ui.getByLabelText('게시판 분류') as HTMLSelectElement;
  fireEvent.change(title,{target:{value:'커뮤니티'}});fireEvent.change(body,{target:{value:'직접 작성한 한글 원문은 번역하지 않습니다.'}});fireEvent.change(category,{target:{value:'패션'}});
  select(ui,'en');assert.ok(ui.container.querySelector('input:not([type])')===title);assert.equal(title.value,'커뮤니티');assert.equal(body.value,'직접 작성한 한글 원문은 번역하지 않습니다.');assert.equal(category.value,'패션');assert.ok(!/[가-힣]/.test(category.selectedOptions[0].textContent!));
  fireEvent.click(ui.getByRole('button',{name:t('익명으로 등록하기','en')}));assert.equal(saved?.topic,'패션');assert.equal(saved?.title,'커뮤니티');assert.equal(saved?.caption,body.value);
  cleanup();const post={...saved!,comments:[{id:'new-comment',ownerKey:'demo',text:'개인정보 처리방침',createdAt:new Date().toISOString()}]};const board=app(<BoardDetail post={post} state={readState(null)} onBack={()=>{}} onLike={()=>{}} onSave={()=>{}} onReport={()=>true} onComment={()=>true}/>,'en');assert.ok(board.getByRole('heading',{name:'커뮤니티'}));assert.ok(board.getByText('개인정보 처리방침'));assert.ok(board.getByText(body.value));
});

test('selected product color, quantity and cart acknowledgement survive locale changes',()=>{
  let choice:{variant:string;quantity:number}|undefined;const ui=app(<ProductDetail product={products[0]} favorite={false} onFavorite={()=>{}} onAdd={(_,variant,quantity)=>{choice={variant,quantity};}}/>,'ko');
  fireEvent.click(ui.getByRole('button',{name:'블랙 / 화이트'}));fireEvent.click(ui.getByRole('button',{name:'수량 늘리기'}));select(ui,'en');
  assert.equal(ui.getByTestId('selected-product-image').getAttribute('src'),'/images/tote-black.en.svg');assert.equal(ui.getByRole('button',{name:'Black / White'}).getAttribute('aria-pressed'),'true');assert.equal(ui.getByRole('status').textContent,'2');assert.deepEqual(untranslated(ui.container),[]);
  fireEvent.click(ui.getByRole('button',{name:t('장바구니에 담기','en')}));assert.deepEqual(choice,{variant:'black-white',quantity:2});
  cleanup();localStorage.removeItem(LOCALE_KEY);const cart=app(<CartPanel cart={[{productId:products[0].id,variant:'black-white',quantity:2}]} onQuantity={()=>{}} onShop={()=>{}} onOrder={()=>'test-id'} onOrders={()=>{}}/>,'ko');fireEvent.click(cart.getByRole('button',{name:'주문 과정 테스트하기'}));fireEvent.click(cart.getByRole('checkbox'));select(cart,'vi');assert.equal((cart.getByRole('checkbox') as HTMLInputElement).checked,true);assert.equal((cart.getByRole('button',{name:t('테스트 주문 생성','vi')}) as HTMLButtonElement).disabled,false);assert.deepEqual(untranslated(cart.container),[]);
});

test('signup consent and complete legal documents follow the selected language without losing agreement',()=>{
  const ui=app(<Signup/>,'ko');fireEvent.click(ui.getByRole('checkbox'));fireEvent.click(ui.getByRole('button',{name:'[이용약관]'}));const dialog=ui.getByRole('dialog');select(ui,'vi');assert.ok(ui.getByRole('dialog')===dialog);assert.match(dialog.textContent!,/Điều/);assert.ok(!/[가-힣]/.test(dialog.textContent!));assert.equal(dialog.querySelector('.information-copy')?.getAttribute('lang'),'vi');
  // Escape closes only the language menu, preserving the open legal document.
  fireEvent.click(ui.container.querySelector('.language-menu-toggle')!);fireEvent.keyDown(document,{key:'Escape'});assert.equal(ui.queryByRole('menu'),null);assert.ok(ui.getByRole('dialog')===dialog);
  select(ui,'en');assert.match(dialog.textContent!,/Terms/);fireEvent.click(within(dialog).getByRole('button',{name:t('닫기','en')}));assert.equal((ui.getByRole('checkbox') as HTMLInputElement).checked,true);assert.equal((ui.getByRole('button',{name:t('동의하고 회원가입','en')}) as HTMLButtonElement).disabled,false);
  for(const locale of ['vi','en'] as const)for(const kind of ['privacy','terms'] as const){cleanup();localStorage.removeItem(LOCALE_KEY);const legal=app(<LegalDocument kind={kind}/>,locale);assert.deepEqual(untranslated(legal.container),[]);assert.ok(legal.container.querySelector('.information-copy')!.textContent!.length>700);}
});

test('emergency legal viewing and language changes preserve private fields and still permit a consented test',async()=>{
  let actualCalls=0;const ui=app(<EmergencyPage isDemoAccount gateway={{access:async()=>({enabled:false,isAdmin:false,consentVersion:''}),submit:async()=>{actualCalls++;return {id:'unexpected'};},list:async()=>[],open:async()=>{throw new Error('unused');},resolve:async()=>{}}}/>,'ko');fireEvent.click(ui.getByRole('button',{name:'도움요청하기'}));
  const values=[['이름','커뮤니티'],['연락처','+82 10 0000 0000'],['메일주소','example@example.com'],['현위치','서울역 1번 출구 (예시)'],['요청 내용','사용자가 직접 쓴 한글 내용은 다른 언어를 선택해도 그대로 유지됩니다.']];
  const fields=values.map(([label,value])=>{const field=ui.getByLabelText(label) as HTMLInputElement;fireEvent.change(field,{target:{value}});return field;});fireEvent.click(ui.getByRole('checkbox'));fireEvent.click(ui.getByRole('button',{name:'이용약관 보기'}));const href=window.location.href;
  select(ui,'vi');assert.equal(window.location.href,href);for(let i=0;i<fields.length;i++)assert.equal(fields[i].value,values[i][1]);assert.ok(ui.getByRole('region',{name:t('이용약관','vi')}));assert.equal((ui.getByRole('checkbox') as HTMLInputElement).checked,true);assert.deepEqual(untranslated(ui.container),[]);
  fireEvent.click(ui.getByRole('button',{name:t('메세지보내기 (테스트)','vi')}));await waitFor(()=>assert.ok(ui.getByRole('heading',{name:t('작성·동의 테스트를 완료했습니다.','vi')})));assert.equal(actualCalls,0);for(const [,value] of values)assert.ok(!JSON.stringify({...localStorage,...sessionStorage}).includes(value));
});

test('Vietnamese demo login uses the same authorized demo account and leaves UI translated after signing in',async()=>{
  const ui=app(<DemoAccess/>);fireEvent.click(within(ui.getByRole('banner')).getByRole('button',{name:t('로그인','vi')}));fireEvent.change(ui.getByLabelText(t('아이디','vi')),{target:{value:'aaaa'}});fireEvent.change(ui.getByLabelText(t('비밀번호','vi'),{exact:true}),{target:{value:'0000'}});fireEvent.click(within(ui.getByRole('dialog')).getByRole('button',{name:t('로그인','vi')}));await waitFor(()=>assert.ok(ui.container.querySelector('.home-intro')));assert.deepEqual(untranslated(ui.container),[]);select(ui,'en');assert.ok(ui.getByRole('button',{name:'Explore polls'}));
});


test('store and community search accept the translated titles displayed to the visitor',()=>{
  window.history.replaceState(null,'','/#polls');const ui=app(<Experience authenticated/>,'en');
  const title=t(seedPolls[0].title,'en');fireEvent.change(ui.getByRole('textbox',{name:t('투표 검색','en')}),{target:{value:title}});
  assert.equal(ui.container.querySelectorAll('.poll-card').length,1);assert.equal(ui.container.querySelector('.poll-card-open>span')?.textContent,title);
  cleanup();localStorage.removeItem(LOCALE_KEY);window.history.replaceState(null,'','/#community');const board=app(<Experience authenticated/>,'vi');const postTitle=t(seedPosts[0].title,'vi');
  fireEvent.click(board.getByRole('button',{name:t('전체','vi')}));
  fireEvent.change(board.getByRole('textbox',{name:t('게시판 검색','vi')}),{target:{value:postTitle}});assert.equal(board.container.querySelectorAll('.board-row').length,1);assert.equal(board.container.querySelector('.board-title')?.textContent,postTitle);
});
