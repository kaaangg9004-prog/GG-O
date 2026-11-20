import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render,cleanup,fireEvent,within,waitFor} from '@testing-library/react';
import Experience from '../src/components/experience';
import {readState,STORAGE_KEY} from '../src/lib/store';
import {listedNews,saveNews,commentNews,anonymousNewsComments} from '../src/lib/news';
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});
test('news mutations require admin; persisted comments expose only per-story anonymous labels',()=>{
 let s=readState(null);const n=listedNews(s)[0];
 assert.throws(()=>saveNews(s,{...n,title:'권한 없는 수정'},false));
 s=commentNews(s,n.id,'첫 의견','private-a');s=commentNews(s,n.id,'두 번째 의견','private-b');s=commentNews(s,n.id,'다시 남기는 의견','private-a');
 s=readState(JSON.stringify(s));const publicComments=anonymousNewsComments(listedNews(s).find(a=>a.id===n.id)!);
 assert.deepEqual(publicComments.map(c=>c.number),[1,2,1]);assert.ok(!JSON.stringify(publicComments).includes('private-'));
 const edited=saveNews(s,{...n,title:'운영자가 수정한 소식'},true);assert.equal(listedNews(edited).find(a=>a.id===n.id)!.comments.length,3);
});
test('guest news reads publicly without write controls and requests login for comments',async()=>{
 window.history.replaceState(null,'','/#news?id=welcome');let requested=0;const ui=render(<Experience onRequireAuth={()=>{requested++;}}/>);
 await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'GG-O에서 함께 나누고 싶은 이야기'})));
 assert.equal(ui.queryByRole('button',{name:'소식 편집'}),null);assert.equal(ui.queryByLabelText('익명 댓글'),null);
 fireEvent.click(ui.getByRole('button',{name:'로그인 후 댓글 쓰기'}));assert.equal(requested,1);
 fireEvent.click(ui.getByRole('button',{name:'소식 목록'}));assert.equal(window.location.hash,'#news');assert.equal(ui.queryByRole('button',{name:'소식 작성'}),null);
});
test('admin creates a news article; member can comment anonymously after reload but cannot edit',async()=>{
 window.history.replaceState(null,'','/#news');let ui=render(<Experience authenticated accountLabel="BBBB"/>);
 fireEvent.click(await ui.findByRole('button',{name:'소식 작성'}));
 fireEvent.change(ui.getByLabelText('소식 제목'),{target:{value:'새로운 운영 안내'}});fireEvent.change(ui.getByLabelText('소식 내용'),{target:{value:'운영자가 작성하는 상세 안내입니다.'}});
 fireEvent.click(ui.getByRole('button',{name:'소식 저장'}));
 await waitFor(()=>assert.equal(ui.queryByRole('dialog'),null));assert.ok(ui.getByRole('button',{name:'새로운 운영 안내'}));
 cleanup();ui=render(<Experience authenticated accountLabel="AAAA"/>);
 fireEvent.click(await ui.findByRole('button',{name:'새로운 운영 안내'}));assert.equal(ui.queryByRole('button',{name:'소식 편집'}),null);
 fireEvent.change(ui.getByLabelText('익명 댓글'),{target:{value:'좋은 소식이네요.'}});fireEvent.click(ui.getByRole('button',{name:'댓글 등록'}));
 assert.ok(ui.getByText('익명 1'));assert.ok(ui.getByText('좋은 소식이네요.'));
 assert.ok(listedNews(readState(localStorage.getItem(STORAGE_KEY))).some(n=>n.comments.some(c=>c.text==='좋은 소식이네요.')));
});
test('animation category is selectable and saved when composing a post',async()=>{
 window.history.replaceState(null,'','/#community');const ui=render(<Experience authenticated/>);
 const tabs=within(ui.getByRole('group',{name:'게시판 분류'}));fireEvent.click(tabs.getByRole('button',{name:'애니메이션'}));
 assert.equal(tabs.getByRole('button',{name:'애니메이션'}).getAttribute('aria-pressed'),'true');
 const s=readState(null);s.posts=[{id:'anime',title:'추천 작품',caption:'같이 볼 작품',topic:'애니메이션',image:'',tags:[],likes:0,views:0,comments:[],createdAt:new Date().toISOString(),ownerKey:'member'}];
 assert.equal(readState(JSON.stringify(s)).posts[0].topic,'애니메이션');
});
test('event detail deep link survives reload, guest reactions request login, list has no reactions',async()=>{
 window.history.replaceState(null,'','/#events?id=hanoi-meetup');let requested=0;const ui=render(<Experience onRequireAuth={()=>{requested++;}}/>);
 const like=await ui.findByRole('button',{name:'하노이에서, 같이 가자! 좋아요'});fireEvent.click(like);assert.equal(requested,1);assert.equal(like.getAttribute('aria-pressed'),'false');
 fireEvent.click(ui.getByRole('button',{name:'이벤트 목록'}));assert.equal(ui.queryByRole('button',{name:'하노이에서, 같이 가자! 좋아요'}),null);
 fireEvent.click(ui.getByRole('button',{name:'하노이에서, 같이 가자! 상세정보'}));assert.equal(window.location.hash,'#events?id=hanoi-meetup');
});
test('home feature links open the requested news and event detail pages',async()=>{
 const ui=render(<Experience/>);fireEvent.click(ui.getByRole('button',{name:/GG-O 소식.*소식 읽기/}));
 await waitFor(()=>assert.ok(ui.getByRole('button',{name:'소식 목록'})));assert.equal(window.location.hash,'#news?id=welcome');
 fireEvent.click(within(ui.getByRole('navigation',{name:'주 메뉴'})).getByRole('link',{name:'홈'}));
 fireEvent.click(ui.getByRole('button',{name:/이벤트 ·.*상세정보 읽기/}));
 await waitFor(()=>assert.ok(ui.getByRole('button',{name:'이벤트 목록'})));assert.equal(window.location.hash,'#events?id=hanoi-meetup');
});
