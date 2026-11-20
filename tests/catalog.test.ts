import test from 'node:test';
import assert from 'node:assert/strict';
import {products} from '../src/lib/data';
import {catalogProducts,normalizedCart,orderSnapshots,parseProduct,removeProduct,saveProduct} from '../src/lib/catalog';
import {readState} from '../src/lib/store';
import {reactToEvent} from '../src/lib/event-reactions';

test('custom product information, variants and cart survive saving and reloading; deletion removes active references',()=>{
  const product={...structuredClone(products[0]),id:'custom-product',name:'새로 등록한 토트백',origin:'대한민국',materials:'면 100%',detailContent:'직접 작성한 상세 설명'};
  let state=saveProduct(readState(null),product);
  state.cart=[{productId:product.id,variant:product.variants[1].id,quantity:2}];state.favorites=[product.id];
  state=readState(JSON.stringify(state));
  assert.equal(catalogProducts(state)[0].id,product.id);assert.equal(catalogProducts(state)[0].materials,'면 100%');assert.equal(state.cart[0].quantity,2);
  state=saveProduct(state,{...product,name:'수정한 토트백',price:320000});
  assert.equal(catalogProducts(state).find(p=>p.id===product.id)?.name,'수정한 토트백');
  state=readState(JSON.stringify(removeProduct(state,product.id)));
  assert.ok(!catalogProducts(state).some(p=>p.id===product.id));assert.deepEqual(state.cart,[]);assert.deepEqual(state.favorites,[]);
});

test('catalog edits and deletion preserve prior order names, prices and chosen variants',()=>{
  const product=structuredClone(products[0]);let state=readState(null);
  const items=orderSnapshots([{productId:product.id,variant:product.variants[1].id,quantity:2}],products);
  state.orders=[{id:'order-1',status:'demo',createdAt:new Date().toISOString(),subtotal:product.price*2,items}];
  state=saveProduct(state,{...product,name:'나중에 바꾼 이름',price:400000,stock:1});
  state=readState(JSON.stringify(removeProduct(state,product.id)));
  assert.equal(state.orders[0].items[0].productName,product.name);assert.equal(state.orders[0].items[0].unitPrice,product.price);
  assert.equal(state.orders[0].items[0].variantLabel,product.variants[1].label);assert.equal(state.orders[0].subtotal,product.price*2);
});

test('stock and option edits normalize combined variant quantities and remove deleted options',()=>{
  const product={...structuredClone(products[0]),stock:5};
  const cart=normalizedCart([{productId:product.id,variant:product.variants[0].id,quantity:4},{productId:product.id,variant:product.variants[1].id,quantity:4}],[product]);
  assert.deepEqual(cart.map(i=>i.quantity),[4,1]);
  assert.deepEqual(normalizedCart(cart,[{...product,stock:0}]),[]);
  assert.equal(normalizedCart(cart,[{...product,variants:[product.variants[0]]}]).length,1);
});

test('catalog validation rejects unsafe images, duplicate options and invalid prices or stock',()=>{
  const product=structuredClone(products[0]);assert.ok(parseProduct(product));
  for(const patch of [{image:'javascript:alert(1)'},{image:'/images/../../private'},{price:-10},{stock:1.5},{originalPrice:1},{variants:[product.variants[0],{...product.variants[1],label:product.variants[0].label}]}])assert.equal(parseProduct({...product,...patch}),null);
  assert.throws(()=>saveProduct(readState(null),{...product,stock:-1}),/입력 내용/);
});

test('event reactions are exclusive, toggle off, survive reload and migrate earlier interests once',()=>{
  let state=readState(JSON.stringify({schema:2,eventInterests:['hanoi-meetup']}));
  assert.equal(state.eventReactions['hanoi-meetup'],'like');
  state=reactToEvent(state,'hanoi-meetup','dislike');assert.equal(state.eventReactions['hanoi-meetup'],'dislike');assert.deepEqual(state.eventInterests,[]);
  state=readState(JSON.stringify(state));assert.equal(state.eventReactions['hanoi-meetup'],'dislike');
  state=reactToEvent(state,'hanoi-meetup','dislike');assert.equal(readState(JSON.stringify(state)).eventReactions['hanoi-meetup'],undefined);
});
