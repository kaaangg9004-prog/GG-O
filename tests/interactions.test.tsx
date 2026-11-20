import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {ProductDetail,CartPanel} from '../src/components/panels';
import {BoardDetail} from '../src/components/board';
import Experience from '../src/components/experience';
import {products,seedPosts} from '../src/lib/data';
import {readState,STORAGE_KEY} from '../src/lib/store';

afterEach(()=>{cleanup();localStorage.clear();window.history.replaceState(null,'','/');});
test('selecting a color updates the main photo, nearby preview, and the cart variant',()=>{
  let selected='';const ui=render(<ProductDetail product={products[0]} favorite={false} onFavorite={()=>{}} onAdd={(_,variant)=>{selected=variant;}}/>);
  assert.equal(ui.getByTestId('selected-product-image').getAttribute('src'),'/images/tote.svg');
  fireEvent.click(ui.getByRole('button',{name:'블랙 / 화이트'}));
  assert.equal(ui.getByTestId('selected-product-image').getAttribute('src'),'/images/tote-black.svg');
  assert.equal(ui.getByAltText('블랙 / 화이트 색상 미리보기').getAttribute('src'),'/images/tote-black.svg');
  assert.equal(ui.getByRole('button',{name:'블랙 / 화이트'}).getAttribute('aria-pressed'),'true');
  fireEvent.click(ui.getByRole('button',{name:'장바구니에 담기'}));assert.equal(selected,'black-white');
  fireEvent.click(ui.getByRole('button',{name:'에크루 / 블랙'}));assert.equal(ui.getByTestId('selected-product-image').getAttribute('src'),'/images/tote.svg');
});
test('cart shows the chosen color and requires test-order confirmation',()=>{
  let ordered=0;const ui=render(<CartPanel cart={[{productId:'ggo-tote',variant:'black-white',quantity:1}]} onQuantity={()=>{}} onShop={()=>{}} onOrders={()=>{}} onOrder={()=>{ordered++;return '테스트-1234';}}/>);
  assert.equal(ui.getByAltText('에브리데이 캔버스 토트백 블랙 / 화이트').getAttribute('src'),'/images/tote-black.svg');
  fireEvent.click(ui.getByRole('button',{name:'주문 과정 테스트하기'}));
  const submit=ui.getByRole('button',{name:'테스트 주문 생성'});assert.ok((submit as HTMLButtonElement).disabled);
  fireEvent.click(ui.getByRole('checkbox'));fireEvent.click(submit);
  assert.equal(ordered,1);assert.ok(ui.getByText('테스트 주문이 완료됐어요.'));
});
test('author replies have an anonymous author badge and other replies use thread numbers without profile controls',()=>{
  const state=readState(null),post={...structuredClone(seedPosts[0]),ownerKey:state.deviceKey};
  post.comments.push({id:'self-reply',ownerKey:state.deviceKey,text:'나도 같은 생각이야.',createdAt:new Date().toISOString()});
  const ui=render(<BoardDetail post={post} state={state} onComment={()=>true} onLike={()=>{}} onSave={()=>{}} onReport={()=>true} onBack={()=>{}}/>);
  const comments=ui.getAllByTestId('anonymous-comment');assert.equal(comments.length,2);
  assert.ok(within(comments[0]).getByText('익명 1'));assert.ok(within(comments[1]).getByText('익명(글쓴이)'));for(const comment of comments){assert.equal(comment.getAttribute('class'),'board-comment');assert.equal(comment.querySelector('[data-owner]'),null);}
  assert.equal(ui.queryByText('작성자',{exact:true}),null);
  assert.equal(ui.queryByRole('button',{name:/팔로우|메시지 보내기/}),null);
});
test('a reported post enters the queue, can be hidden, and stays hidden after remount',async()=>{
  window.history.replaceState(null,'','/#community');
  let ui=render(<Experience authenticated accountLabel="BBBB"/>);
  await waitFor(()=>assert.ok(ui.getByText('주말에 입기 좋은 깔끔한 코디 추천해 줄 사람?')));
  fireEvent.click(ui.getByText('주말에 입기 좋은 깔끔한 코디 추천해 줄 사람?'));
  fireEvent.click(ui.getByRole('button',{name:'게시글 신고'}));
  fireEvent.click(ui.getByRole('button',{name:'신고 접수'}));
  assert.equal(readState(localStorage.getItem(STORAGE_KEY)).reports.length,1);
  assert.ok((ui.getByRole('button',{name:'게시글 신고 완료'}) as HTMLButtonElement).disabled);
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));
  fireEvent.click(ui.getByRole('button',{name:'신고 관리 테스트'}));
  await waitFor(()=>assert.ok(ui.getByRole('button',{name:'게시글 숨김'})));
  fireEvent.click(ui.getByRole('button',{name:'게시글 숨김'}));
  assert.ok(readState(localStorage.getItem(STORAGE_KEY)).hiddenPosts.includes('post-1'));
  cleanup();window.history.replaceState(null,'','/#community');ui=render(<Experience authenticated accountLabel="BBBB"/>);
  await waitFor(()=>assert.equal(ui.queryByText('주말에 입기 좋은 깔끔한 코디 추천해 줄 사람?'),null));
});

test('anonymous posting and author comments work without a profile, and comment moderation leaves the post visible',async()=>{
  window.history.replaceState(null,'','/#community');const ui=render(<Experience authenticated accountLabel="BBBB"/>);
  await waitFor(()=>assert.ok(ui.getByRole('button',{name:'글쓰기'})));
  fireEvent.click(ui.getByRole('button',{name:'글쓰기'}));
  fireEvent.change(ui.getByLabelText('제목'),{target:{value:'익명 작성과 댓글 테스트'}});
  fireEvent.change(ui.getByLabelText('내용'),{target:{value:'닉네임을 입력하지 않고 글을 등록합니다.'}});
  fireEvent.click(ui.getByRole('button',{name:'익명으로 등록하기'}));
  await waitFor(()=>assert.ok(ui.getByText('익명 작성과 댓글 테스트')));
  assert.equal(readState(localStorage.getItem(STORAGE_KEY)).profile,null);
  fireEvent.click(ui.getByText('익명 작성과 댓글 테스트'));
  fireEvent.change(ui.getByLabelText('익명으로 댓글 쓰기'),{target:{value:'작성자가 남겨도 익명인 댓글'}});
  fireEvent.click(ui.getByRole('button',{name:'댓글 등록'}));
  const comment=ui.getByTestId('anonymous-comment');assert.ok(within(comment).getByText('익명(글쓴이)'));
  fireEvent.click(within(comment).getByRole('button',{name:'댓글 신고'}));
  fireEvent.click(ui.getByRole('button',{name:'신고 접수'}));
  fireEvent.click(ui.getByRole('button',{name:'닫기'}));
  fireEvent.click(ui.getByRole('button',{name:'신고 관리 테스트'}));
  await waitFor(()=>assert.ok(ui.getByRole('button',{name:'댓글 숨김'})));
  fireEvent.click(ui.getByRole('button',{name:'댓글 숨김'}));
  fireEvent.click(ui.getByRole('link',{name:'커뮤니티'}));
  fireEvent.click(ui.getByText('익명 작성과 댓글 테스트'));
  assert.equal(ui.queryByText('작성자가 남겨도 익명인 댓글'),null);
  assert.ok(ui.getByText('닉네임을 입력하지 않고 글을 등록합니다.'));
});

test('every test screen uses Korean interface copy without leftover Vietnamese',async()=>{
  const headings={home:'한국 문화부터 일상까지,',polls:'당신의 한 표가 궁금해요.',community:'커뮤니티',journal:'새로운 취향을 발견해요.',events:'함께할 만남',my:'내 활동.',admin:'사이트 관리.',support:'고객지원.',emergency:'혼자 당황하지 마세요.'};
  for(const [route,heading] of Object.entries(headings)){
    window.history.replaceState(null,'',`/#${route}`);const ui=render(<Experience authenticated accountLabel="BBBB"/>);
    await waitFor(()=>assert.ok(ui.getByRole('heading',{level:1}).textContent?.includes(heading)));
    assert.ok(!/[Đđơưăạệộấếờự]/u.test(ui.container.textContent??''),route);
    assert.equal(ui.queryByRole('button',{name:/Theo dõi|팔로우|메시지 보내기/}),null);
    cleanup();
  }
});
