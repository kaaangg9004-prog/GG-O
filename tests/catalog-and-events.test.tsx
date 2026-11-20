import './dom-setup';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import Experience from '../src/components/experience';
import {ProductDetail} from '../src/components/panels';
import {products} from '../src/lib/data';
import {readState,STORAGE_KEY} from '../src/lib/store';
import {catalogProducts} from '../src/lib/catalog';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();window.history.replaceState(null,'','/');});

test('product information is closed between add-to-cart and delivery; long details appear below',()=>{
  const ui=render(<ProductDetail product={{...products[0],origin:'대한민국',materials:'면 100%',detailContent:'직접 입력한 긴 상세 설명'}} favorite={false} onFavorite={()=>{}} onAdd={()=>{}}/>);
  const details=ui.getByText('제품정보',{exact:true}).closest('details')!;
  assert.equal(details.open,false);
  const add=ui.getByRole('button',{name:'장바구니에 담기'}),delivery=ui.getByText('한국에서 베트남으로 배송').closest('details')!;
  assert.ok(add.compareDocumentPosition(details)&Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(details.compareDocumentPosition(delivery)&Node.DOCUMENT_POSITION_FOLLOWING);
  fireEvent.click(within(details).getByText('제품정보'));assert.equal(details.open,true);
  assert.ok(within(details).getByText('대한민국'));assert.ok(within(details).getByText('면 100%'));assert.ok(ui.getByRole('region',{name:'상품 상세 설명'}));assert.ok(ui.getByText('직접 입력한 긴 상세 설명'));
  cleanup();const soldOut=render(<ProductDetail product={{...products[0],stock:0}} favorite={false} onFavorite={()=>{}} onAdd={()=>{throw new Error('sold out');}}/>);
  assert.equal((soldOut.getByRole('button',{name:'품절'}) as HTMLButtonElement).disabled,true);
});

test('the five dock buttons navigate in the requested order and event reactions persist and toggle',async()=>{
  let ui=render(<Experience authenticated/>);const dock=within(ui.getByRole('navigation',{name:'모바일 주 메뉴'}));
  assert.deepEqual(dock.getAllByRole('button').map(b=>b.textContent),['홈','소식','커뮤니티','투표','이벤트']);
  fireEvent.click(dock.getByRole('button',{name:'이벤트'}));
  await waitFor(()=>assert.ok(ui.getByRole('heading',{name:'하노이에서, 같이 가자!'})));
  fireEvent.click(ui.getByRole('button',{name:'하노이에서, 같이 가자! 상세정보'}));
  const like=ui.getByRole('button',{name:'하노이에서, 같이 가자! 좋아요'}),dislike=ui.getByRole('button',{name:'하노이에서, 같이 가자! 싫어요'});
  fireEvent.click(like);assert.equal(like.getAttribute('aria-pressed'),'true');assert.equal(dislike.getAttribute('aria-pressed'),'false');
  fireEvent.click(dislike);assert.equal(like.getAttribute('aria-pressed'),'false');assert.equal(dislike.getAttribute('aria-pressed'),'true');
  cleanup();window.history.replaceState(null,'','/#events?id=hanoi-meetup');ui=render(<Experience authenticated/>);
  await waitFor(()=>assert.equal(ui.getByRole('button',{name:'하노이에서, 같이 가자! 싫어요'}).getAttribute('aria-pressed'),'true'));
  fireEvent.click(ui.getByRole('button',{name:'하노이에서, 같이 가자! 싫어요'}));assert.equal(readState(localStorage.getItem(STORAGE_KEY)).eventReactions['hanoi-meetup'],undefined);
});
