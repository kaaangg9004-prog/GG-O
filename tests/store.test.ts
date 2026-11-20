import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal, initialState, readState, updateCart } from '../src/lib/store';
import { products, seedPosts } from '../src/lib/data';

test('mixed product variants keep separate quantities and correct VND totals', () => {
  let cart = updateCart([], {productId:'ggo-tote',variant:'Ecru / Đen',quantity:2},30);
  cart = updateCart(cart, {productId:'ggo-tote',variant:'Đen / Trắng',quantity:1},30);
  cart = updateCart(cart, {productId:'ggo-keyring',variant:'Neon Green',quantity:3},55);
  assert.equal(cart.length,3);
  assert.equal(cartTotal(cart,products),290000*3+95000*3);
  cart = updateCart(cart, {...cart[0],quantity:0},30);
  assert.equal(cart.length,2);
  assert.equal(cartTotal(cart,products),290000+95000*3);
});

test('invalid, fractional, and oversized quantities cannot inflate the cart', () => {
  const item = {productId:'ggo-cap',variant:'Washed Black',quantity:4.9};
  assert.equal(updateCart([],item,24)[0].quantity,4);
  assert.equal(updateCart([],{...item,quantity:100000},24)[0].quantity,24);
  for(const quantity of [NaN,Infinity,-4,0]) assert.deepEqual(updateCart([],{...item,quantity},24),[]);
});

test('corrupted persisted state recovers without crashing or retaining invalid orders', () => {
  for(const raw of ['{bad','null','[]','{"schema":9}']) { const restored=readState(raw);assert.ok(restored.deviceKey);assert.deepEqual({...restored,deviceKey:''},initialState); }
  const state=readState(JSON.stringify({...initialState,cart:[{productId:'ggo-tote',variant:'Ecru / Đen',quantity:-2}],posts:[{id:'broken',caption:'bad',tags:[],comments:[]}],orders:[{id:'paid',status:'paid',items:[]}]}));
  assert.deepEqual(state.cart,[]);assert.deepEqual(state.posts,[]);assert.deepEqual(state.orders,[]);
});

test('favorites, local posts, seed comments and demo orders survive reload together', () => {
  const state={...structuredClone(initialState),favorites:['ggo-tote','ggo-tote'],posts:[{...seedPosts[0],comments:[...seedPosts[0].comments,{id:'comment-local',author:'Me',text:'Love this',createdAt:'2026-11-14T00:00:00Z'}]}],profile:{name:'Bạn GG-O',handle:'ggo.friend',bio:'K-culture'},orders:[{id:'TEST-12345678',status:'demo',items:[{productId:'ggo-tote',variant:'Ecru / Đen',quantity:1}],subtotal:290000,createdAt:'2026-11-14T00:00:00Z'}]};
  const restored=readState(JSON.stringify(state));
  assert.deepEqual(restored.favorites,['ggo-tote']);
  assert.equal(restored.posts[0].comments.length,2);
  assert.equal(restored.profile?.handle,'ggo.friend');
  assert.equal(restored.orders[0].subtotal,290000);
});

test('state recovery produces independent defaults, preventing cross-session contamination', () => {
  const first=readState(null); first.favorites.push('ggo-tote');
  const second=readState(null); assert.deepEqual(second.favorites,[]);assert.deepEqual(initialState.favorites,[]);
});
