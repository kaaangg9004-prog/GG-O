'use client';


import {useLocalized} from '@/components/locale-provider';
import {isPresetProductText} from '@/lib/localized-content';
import {useEffect,useState} from 'react';
import {ArrowRight,ArrowUpRight,Check,CheckCircle2,ChevronDown,Heart,ImagePlus,LockKeyhole,Minus,Plus,ShieldCheck,ShoppingBag,Trash2,X} from 'lucide-react';
import type {CartItem,Post,Product,BoardCategory} from '@/lib/types';
import {boardCategories} from '@/lib/types';
import {money,products as seedProducts,productVariant} from '@/lib/data';
import {cartTotal} from '@/lib/store';
import {EmptyState} from './ui';

export function ProductDetail({product,favorite,onFavorite,onAdd}:{product:Product;favorite:boolean;onFavorite:()=>void;onAdd:(p:Product,variant:string,quantity:number)=>void}) {
  const localize=useLocalized();
  const [variantId,setVariant]=useState(product.variants[0].id);
  const [quantity,setQuantity]=useState(1);
  const variant=productVariant(product,variantId);
  useEffect(()=>setQuantity(q=>Math.max(1,Math.min(q,product.stock))),[product.stock]);
  return localize(<div className="product-detail-layout"><div className="product-detail">
    <div className="detail-product-image"><img key={variant.image} src={variant.image} alt={`${product.name} · ${variant.label}`} data-testid="selected-product-image"/><span className="product-tag" translate={isPresetProductText(product,product.tag)?'yes':'no'}>{product.tag}</span><span className="image-caption">GG-O 상품 참고 이미지</span></div>
    <div className="detail-product-copy"><p className="eyebrow" translate={!product.tag||isPresetProductText(product,product.tag)?'yes':'no'}>{product.tag||'상품 안내'}</p><h1 translate={isPresetProductText(product,product.name)?'yes':'no'}>{product.name}</h1>
      <div className="detail-price"><strong>{money(product.price)}</strong>{product.originalPrice&&<del>{money(product.originalPrice)}</del>}</div>
      <p className="detail-description" translate={isPresetProductText(product,product.description)?'yes':'no'}>{product.description}</p>
      <fieldset className="variant-field"><legend>색상·옵션 선택</legend><div>{product.variants.map(v=><button key={v.id} className={variant.id===v.id?'selected':''} onClick={()=>setVariant(v.id)} aria-pressed={variant.id===v.id}><span className="variant-swatch" style={{background:v.swatch}} aria-hidden="true"/><span translate={isPresetProductText(product,v.label)?'yes':'no'}>{v.label}</span></button>)}</div></fieldset>
      <div className="variant-preview"><img src={variant.image} alt={`${variant.label} 색상 미리보기`}/><div aria-live="polite"><strong translate={isPresetProductText(product,variant.label)?'yes':'no'}>{variant.label}</strong><span>선택한 색상이 위 상품 이미지에도 반영됩니다.</span></div></div>
      <span className="quantity-label">수량</span><div className="add-row"><div className="quantity-control"><button disabled={quantity<=1||product.stock===0} aria-label="수량 줄이기" onClick={()=>setQuantity(Math.max(1,quantity-1))}><Minus size={15}/></button><output aria-live="polite">{quantity}</output><button disabled={quantity>=product.stock||product.stock===0} aria-label="수량 늘리기" onClick={()=>setQuantity(Math.min(product.stock,quantity+1))}><Plus size={15}/></button></div><button className={`favorite-detail ${favorite?'is-liked':''}`} onClick={onFavorite} aria-pressed={favorite}><Heart size={18} fill={favorite?'currentColor':'none'}/>{favorite?'찜한 상품':'찜하기'}</button></div>
      <button className="button button-dark full-width" disabled={product.stock===0} onClick={()=>onAdd(product,variant.id,quantity)}>{product.stock===0?'품절':'장바구니에 담기'}<ShoppingBag size={19}/></button>
      <details className="product-info-accordion"><summary>제품정보<ChevronDown size={17}/></summary><dl className="product-specs">{[['브랜드',product.brand],['원산지',product.origin],['원재료·성분',product.materials],['크기·용량·구성',product.size],['사용·관리 안내',product.care]].map(([label,value])=><div key={label}><dt>{label}</dt><dd translate={value&&!isPresetProductText(product,value)?'no':'yes'}>{value||'정보를 준비하고 있습니다.'}</dd></div>)}</dl></details>
      <details><summary>한국에서 베트남으로 배송<ChevronDown size={17}/></summary><p>국제배송을 준비하고 있습니다. 배송비, 예상 기간, 관세와 세금은 정식 판매 전에 안내합니다. 주문 예시은 실제로 배송되지 않습니다.</p></details>
      <details><summary>교환·반품 안내<ChevronDown size={17}/></summary><p>교환·반품 가능 기간과 조건, 비용은 실제 판매 전에 안내합니다. 현재 주문 예시은 실제로 배송되지 않습니다.</p></details>
      <div className="detail-note"><ShieldCheck size={17}/><span>현재는 예시 상품이며 실제 결제는 진행되지 않습니다.</span></div>
    </div>
  </div><section className="product-long-details" aria-label="상품 상세 설명"><p className="eyebrow">상품을 더 자세히 알아보세요</p><h2>상품 상세</h2><p className="product-detail-prose" translate={isPresetProductText(product,product.detailContent||product.description)?'yes':'no'}>{product.detailContent||product.description}</p><div className="product-detail-gallery">{(product.detailImages?.length?product.detailImages:[variant.image]).map((src,index)=><img key={index} src={src} alt={`${product.name} 상세 이미지 ${index+1}`} loading="lazy"/>)}</div></section></div>);
}

export function CartPanel({cart,onQuantity,onShop,onOrder,onOrders,catalog=seedProducts}:{catalog?:Product[];cart:CartItem[];onQuantity:(item:CartItem,q:number)=>void;onShop:()=>void;onOrder:()=>string|null;onOrders:()=>void}) {
  const localize=useLocalized();
  const [step,setStep]=useState<'bag'|'review'|'success'>('bag');
  const [orderId,setOrderId]=useState(''),[ack,setAck]=useState(false);
  const subtotal=cartTotal(cart,catalog);
  if(step==='success')return localize(<div className="order-success"><span className="success-icon"><CheckCircle2 size={43}/></span><p className="eyebrow">결제 없는 주문 미리보기</p><h2>주문 예시를 저장했어요.</h2><p>주문 번호: <strong translate="no">{orderId}</strong></p><p>실제 결제·판매자 전송·배송은 진행되지 않습니다. 내 보관함에서 주문 예시을 확인할 수 있습니다.</p><button className="button button-dark full-width" onClick={onOrders}>주문 예시 보기<ArrowUpRight size={18}/></button><button className="text-link" onClick={onShop}>계속 둘러보기<ArrowRight size={16}/></button></div>);
  if(!cart.length)return localize(<EmptyState title="장바구니가 비어 있어요." text="마음에 드는 상품과 색상을 골라 담아 보세요." action="상품 둘러보기" onAction={onShop}/>);
  return localize(<div className="cart-panel">
    {step==='review'&&<button className="back-link" onClick={()=>setStep('bag')}>← 장바구니로 돌아가기</button>}
    <div className="cart-mode-label"><span className="status-dot"/>{step==='bag'?'장바구니':'주문 예시 확인'}</div>
    <div className="cart-items">{cart.map(item=>{const product=catalog.find(p=>p.id===item.productId);if(!product)return null;const variant=productVariant(product,item.variant);return <article className="cart-item" key={`${item.productId}-${item.variant}`}><img src={variant.image} alt={`${product.name} ${variant.label}`}/><div><p translate={isPresetProductText(product,product.brand)?'yes':'no'}>{product.brand}</p><h3 translate={isPresetProductText(product,product.name)?'yes':'no'}>{product.name}</h3><span translate={isPresetProductText(product,variant.label)?'yes':'no'}>{variant.label}</span><strong>{money(product.price)}</strong>{step==='bag'?<div className="cart-item-actions"><div className="quantity-control"><button aria-label={`${product.name} 수량 줄이기`} onClick={()=>onQuantity(item,item.quantity-1)}><Minus size={13}/></button><output>{item.quantity}</output><button aria-label={`${product.name} 수량 늘리기`} onClick={()=>onQuantity(item,item.quantity+1)}><Plus size={13}/></button></div><button className="icon-button" aria-label={`${product.name} 삭제`} onClick={()=>onQuantity(item,0)}><Trash2 size={16}/></button></div>:<span>수량: {item.quantity}개</span>}</div></article>;})}</div>
    <div className="cart-summary"><div><span>상품 금액</span><strong>{money(subtotal)}</strong></div><div><span>배송비·세금</span><span>정식 판매 전 확정</span></div><p>베트남 동 기준 예시 가격입니다. 배송비와 세금이 정해지지 않아 최종 결제 금액은 아직 확정되지 않았습니다.</p></div>
    {step==='bag'?<><button className="button button-dark full-width" onClick={()=>setStep('review')}>주문 과정 미리보기<ArrowRight size={18}/></button><p className="checkout-notice"><LockKeyhole size={14}/>실제 결제 없음 · 개인정보 입력 없음</p></>:<form onSubmit={e=>{e.preventDefault();if(!ack)return;const id=onOrder();if(id){setOrderId(id);setStep('success');}}}><div className="test-address"><p className="eyebrow">예시 배송지</p><strong>예시 고객 · 베트남 하노이</strong><p>예시 주소입니다. 실제 주소나 전화번호는 수집하지 않습니다.</p></div><div className="test-payment"><ShieldCheck size={21}/><div><strong>모의 결제</strong><p>실제 결제사에 연결하지 않았으며 돈이 청구되지 않습니다.</p></div></div><label className="checkbox-label"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} required/><span>실제 결제와 배송이 없는 주문 예시임을 확인했습니다.</span></label><button disabled={!ack} className="button button-lime full-width">주문 예시 저장<Check size={18}/></button></form>}
  </div>);
}

export function Composer({ownerKey,onSubmit}:{ownerKey:string;onSubmit:(post:Post)=>void}) {
  const localize=useLocalized();
  const [title,setTitle]=useState(''),[caption,setCaption]=useState(''),[image,setImage]=useState('');
  const [topic,setTopic]=useState<BoardCategory>('자유'),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const upload=(file?:File)=>{
    if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('사진은 JPG, PNG, WebP 형식으로 올려 주세요.');return;}
    if(file.size>1024*1024){setError('사진은 1MB 이하로 올려 주세요.');return;}
    setLoading(true);setError('');const reader=new FileReader();reader.onload=()=>{setImage(String(reader.result));setLoading(false);};reader.onerror=()=>{setError('사진을 읽지 못했습니다. 다시 선택해 주세요.');setLoading(false);};reader.readAsDataURL(file);
  };
  return localize(<form className="standard-form composer" onSubmit={e=>{e.preventDefault();if(title.trim().length<2||caption.trim().length<3||loading)return;onSubmit({id:crypto.randomUUID(),ownerKey,title:title.trim(),caption:caption.trim(),topic,image,tags:[],likes:0,views:0,comments:[],createdAt:new Date().toISOString()});}}>
    <div className="anonymous-notice"><ShieldCheck size={18}/><p>글과 댓글은 모두 <strong>익명</strong>입니다. 닉네임과 프로필, 작성자 댓글 표시는 없습니다.</p></div>
    <label>게시판 분류<select value={topic} onChange={e=>setTopic(e.target.value as BoardCategory)}>{boardCategories.filter(c=>c!=='전체').map(c=><option key={c}>{c}</option>)}</select></label>
    <label>제목<input value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={100} required placeholder="어떤 이야기를 나누고 싶나요?"/></label>
    <label>내용<textarea aria-label="내용" aria-describedby="post-character-count" value={caption} onChange={e=>setCaption(e.target.value)} minLength={3} maxLength={3000} rows={7} required placeholder="취향과 일상을 편하게 이야기해 주세요."/><small id="post-character-count">{caption.length.toLocaleString('ko-KR')} / 3,000자</small></label>
    {image&&<div className="composer-preview"><img src={image} alt="첨부 사진 미리보기"/><button type="button" className="remove-image" aria-label="첨부 사진 삭제" onClick={()=>setImage('')}><X size={18}/></button></div>}
    <label className="upload-button"><ImagePlus size={20}/><span>사진 첨부 (선택)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>upload(e.target.files?.[0])}/></label>
    <small>사진 없이 글만 작성할 수도 있습니다. 본인에게 사용 권한이 있는 사진만 올려 주세요.</small>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <p className="privacy-note">개인정보는 적지 말아 주세요. 작성한 글은 현재 브라우저에만 저장됩니다.</p>
    <button className="button button-dark full-width" disabled={title.trim().length<2||caption.trim().length<3||loading}>{loading?'사진을 읽고 있어요':'익명으로 등록하기'}<ArrowUpRight size={18}/></button>
  </form>);
}
