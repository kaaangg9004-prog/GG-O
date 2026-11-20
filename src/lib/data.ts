import type { Product, Post, CommunityEvent } from './types';

export const categories = [
  {id:'all',name:'전체',en:'나를 위한 작은 발견'},
  {id:'beauty',name:'뷰티',en:'내 방식대로 빛나기'},
  {id:'accessories',name:'액세서리',en:'작지만 확실한 포인트'},
  {id:'lifestyle',name:'라이프스타일',en:'매일을 조금 더 특별하게'},
] as const;

export const products: Product[] = [
  {id:'ggo-tote',origin:"판매 전 확정 예정",materials:"캔버스 소재 콘셉트 · 실제 혼용률은 판매 전 확정",size:"실물 크기·구성은 판매 전 안내",care:"실제 상품의 관리·사용 안내는 판매 전 확정",detailContent:"노트북과 책, 하루에 필요한 물건을 담는 데일리 토트백입니다.\n\n에크루 바탕의 블랙 로고와 블랙 바탕의 화이트 로고를 옵션에서 비교해 보세요. 가벼운 차림에도 자연스럽게 어울리는 GG-O의 가방 콘셉트입니다.\n\n현재 이미지는 상품 참고 이미지이며, 실물의 소재·크기·구성은 정식 판매 전에 확정합니다.",name:'에브리데이 캔버스 토트백',brand:'GG-O 자체 제작',category:'lifestyle',price:290000,image:'/images/tote.svg',tag:'단독 상품',description:'노트북과 책, 좋아하는 것들을 담는 넉넉한 캔버스 토트백입니다. 에크루 바탕에 블랙 로고, 블랙 바탕에 화이트 로고를 직접 비교해 보세요. 판매 전 공개한 상품 콘셉트입니다.',variants:[
    {id:'ecru-black',label:'에크루 / 블랙',image:'/images/tote.svg',swatch:'#e5dcc7',legacyLabel:'Ecru / Đen'},
    {id:'black-white',label:'블랙 / 화이트',image:'/images/tote-black.svg',swatch:'#252622',legacyLabel:'Đen / Trắng'},
  ],stock:30,featured:true},
  {id:'ggo-lip',origin:"판매 전 확정 예정",materials:"전성분·용량은 실제 판매 상품 확정 후 안내",size:"실물 크기·구성은 판매 전 안내",care:"실제 상품의 관리·사용 안내는 판매 전 확정",detailContent:"일상에서 부담 없이 즐길 수 있는 세 가지 립 컬러 콘셉트입니다.\n\n서울 로즈, 피치 무드, 체리 온을 선택해 패키지 색상을 비교할 수 있습니다. 화면에서 보이는 색은 실제 발색을 보장하지 않습니다.\n\n판매 전 공개한 상품 콘셉트입니다. 실제 판매 전에 전성분, 용량, 사용 기한, 주의사항을 안내합니다.",name:'데일리 글로우 립 틴트',brand:'GG-O 뷰티 셀렉션',category:'beauty',price:185000,originalPrice:220000,image:'/images/tint.svg',tag:'인기 상품',description:'가볍고 자연스러운 컬러를 담은 립 틴트 콘셉트입니다. 색상별 제품 이미지를 비교할 수 있습니다. 성분과 판매 정보는 정식 판매 전에 안내합니다.',variants:[
    {id:'rose',label:'01 서울 로즈',image:'/images/tint.svg',swatch:'#cc7d80',legacyLabel:'01 Seoul Rose'},
    {id:'peach',label:'02 피치 무드',image:'/images/tint-peach.svg',swatch:'#ed9a6e',legacyLabel:'02 Peach Mood'},
    {id:'cherry',label:'03 체리 온',image:'/images/tint-cherry.svg',swatch:'#b63e52',legacyLabel:'03 Cherry On'},
  ],stock:42,featured:true},
  {id:'ggo-keyring',origin:"판매 전 확정 예정",materials:"직물 스트랩·금속 링 콘셉트 · 소재 사양 판매 전 확정",size:"실물 크기·구성은 판매 전 안내",care:"실제 상품의 관리·사용 안내는 판매 전 확정",detailContent:"가방이나 열쇠에 작은 포인트를 더하는 스트랩 키링 콘셉트입니다.\n\n네온 그린, 클라우드 화이트, 올 블랙을 골라 나에게 맞는 조합을 비교해 보세요.\n\n사진과 재고는 예시이며 실제 구성과 소재는 판매 전에 안내합니다.",name:'리틀 버디 키링',brand:'GG-O 자체 제작',category:'accessories',price:95000,image:'/images/keyring.svg',tag:'신상품',description:'가방과 열쇠에 달기 좋은 작은 포인트. 네온 그린, 화이트, 블랙 세 가지 색상을 비교해 보세요.',variants:[
    {id:'neon',label:'네온 그린',image:'/images/keyring.svg',swatch:'#adff00',legacyLabel:'Neon Green'},
    {id:'white',label:'클라우드 화이트',image:'/images/keyring-white.svg',swatch:'#f4f1e9',legacyLabel:'Cloud White'},
    {id:'black',label:'올 블랙',image:'/images/keyring-black.svg',swatch:'#22251f',legacyLabel:'All Black'},
  ],stock:55,featured:true},
  {id:'ggo-cap',origin:"판매 전 확정 예정",materials:"직물 소재 콘셉트 · 실제 혼용률 판매 전 확정",size:"실물 크기·구성은 판매 전 안내",care:"실제 상품의 관리·사용 안내는 판매 전 확정",detailContent:"산책과 카페, 여유로운 하루에 어울리는 공용 캡 콘셉트입니다.\n\n워시드 블랙과 스톤 베이지 중 원하는 옵션을 선택할 수 있습니다.\n\n실물의 사이즈와 조절 범위, 소재 및 관리법은 정식 판매 전에 확정합니다.",name:'오프 듀티 로고 캡',brand:'GG-O 자체 제작',category:'accessories',price:250000,image:'/images/cap.svg',tag:'새로 들어왔어요',description:'뒤쪽 스트랩으로 크기를 조절하는 공용 로고 캡. 워시드 블랙과 스톤 베이지를 비교해 보세요.',variants:[
    {id:'washed-black',label:'워시드 블랙',image:'/images/cap.svg',swatch:'#282a23',legacyLabel:'Washed Black'},
    {id:'stone-beige',label:'스톤 베이지',image:'/images/cap-beige.svg',swatch:'#cdbda0',legacyLabel:'Stone Beige'},
  ],stock:24,featured:true},
  {id:'ggo-pouch',origin:"판매 전 확정 예정",materials:"캔버스 소재 콘셉트 · 실제 혼용률 판매 전 확정",size:"실물 크기·구성은 판매 전 안내",care:"실제 상품의 관리·사용 안내는 판매 전 확정",detailContent:"립 제품과 이어폰, 작은 소품을 한곳에 담는 파우치 콘셉트입니다.\n\n에크루와 블랙 옵션을 비교해 보세요. 토트백과 함께 사용하는 일상 소품을 제안합니다.\n\n이미지는 콘셉트 예시입니다. 실물 크기와 구성, 세탁 방법은 판매 전에 안내합니다.",name:'스몰 띵스 파우치',brand:'GG-O 자체 제작',category:'lifestyle',price:135000,image:'/images/pouch.svg',tag:'매일 쓰는 소품',description:'이어폰, 립 제품, 카드처럼 작은 물건을 정리하는 캔버스 파우치입니다.',variants:[
    {id:'ecru',label:'에크루',image:'/images/pouch.svg',swatch:'#e6dfce',legacyLabel:'Ecru'},
    {id:'black',label:'블랙',image:'/images/pouch-black.svg',swatch:'#242620',legacyLabel:'Black'},
  ],stock:28},
  {id:'ggo-skin',origin:"판매 전 확정 예정",materials:"전성분·구성품은 실제 판매 상품 확정 후 안내",size:"실물 크기·구성은 판매 전 안내",care:"실제 상품의 관리·사용 안내는 판매 전 확정",detailContent:"매일의 관리에 필요한 기초 제품을 제안하는 스킨 케어 세트 예시입니다.\n\n현재 사진은 참고 이미지이며 실제 판매 상품의 브랜드나 구성을 확정한 상태는 아닙니다.\n\n정식 판매 전에 각 구성품의 원산지, 전성분, 용량과 주의사항을 제품정보에서 확인할 수 있도록 안내합니다.",name:'프레시 스타트 스킨 케어 세트',brand:'GG-O 뷰티 셀렉션',category:'beauty',price:390000,originalPrice:450000,image:'/images/beauty.jpg',tag:'뷰티 추천',description:'매일의 피부 관리를 위한 기초 세트 예시입니다. 사진과 가격은 판매 전 참고 정보입니다.',variants:[
    {id:'starter',label:'기본 세트',image:'/images/beauty.jpg',swatch:'#e8e5dc',legacyLabel:'Starter Set'},
  ],stock:20},
];
export function productVariant(product:Product,id:string) {
  return product.variants.find(v=>v.id===id||v.label===id||v.legacyLabel===id) ?? product.variants[0];
}

// Samples contain no member name, handle, avatar, or public author identifier.
export const seedPosts: Post[] = [
  {id:'post-1',title:'주말에 입기 좋은 깔끔한 코디 추천해 줄 사람?',ownerKey:'sample-owner-1',caption:'요즘 블랙과 에크루 조합에 빠졌어. 과하지 않게 포인트 주는 소품이 있으면 추천해 줘! 다들 주말에 뭐 입고 나가?',image:'/images/street.jpg',tags:['주말코디','패션'],likes:28,views:326,comments:[{id:'c-1',ownerKey:'sample-comment-1',text:'무채색 코디에 네온 키링 하나 달면 예쁠 것 같아.',createdAt:'2026-11-13T07:30:00Z'}],createdAt:'2026-11-13T07:00:00Z',topic:'패션'},
  {id:'post-2',title:'가벼운 데일리 립 컬러는 어떤 톤이 좋아?',ownerKey:'sample-owner-2',caption:'진한 색보다는 자연스럽게 생기 있어 보이는 색이 좋아. 로즈랑 피치 중에 고민 중인데 자주 쓰는 톤 있어?',image:'/images/beauty-pink.jpg',tags:['립추천','뷰티'],likes:16,views:214,comments:[],createdAt:'2026-11-12T09:00:00Z',topic:'패션'},
  {id:'post-3',title:'하노이에서 조용히 쉬기 좋은 카페 이야기',ownerKey:'sample-owner-3',caption:'좋아하는 음악 들으면서 천천히 보내는 오후가 제일 좋더라. 여행 갈 때 꼭 챙기는 나만의 물건이나 습관도 같이 이야기해 보자.',image:'/images/cafe.jpg',tags:['하노이','카페'],likes:12,views:178,comments:[],createdAt:'2026-11-11T06:00:00Z',topic:'자유'},
  {id:'post-4',title:'출근길에 듣기 좋은 한국 음악 추천해 줘',ownerKey:'sample-owner-4',caption:'너무 시끄럽지 않고 기분 좋아지는 노래를 찾고 있어. 요즘 반복해서 듣는 곡이 있으면 알려 줘!',image:'',tags:['음악추천'],likes:9,views:96,comments:[],createdAt:'2026-11-10T06:00:00Z',topic:'음악'},
  {id:'post-5',title:'커뮤니티 이용 전에 확인해 주세요',ownerKey:'sample-owner-5',caption:'모든 글과 댓글은 익명으로 표시됩니다. 다른 사람의 개인정보를 공유하지 말고, 문제가 있는 내용은 신고 버튼으로 알려 주세요. 팔로우와 개인 메시지는 제공하지 않습니다.',image:'',tags:['이용안내'],likes:5,views:82,comments:[],createdAt:'2026-11-09T06:00:00Z',topic:'자유'},
  {id:'post-6',title:'미래의 나에게 맡겼는데 미래의 나도 나였음ㅋㅋ',ownerKey:'sample-owner-6',caption:'오늘도 할 일을 내일의 나에게 보냈다. 답장은 아직 안 왔다. 다들 미루기 방지 꿀팁 있어?',image:'',tags:['밈','일상'],likes:36,views:714,comments:[],createdAt:'2026-11-15T08:00:00Z',topic:'밈'},
  {id:'post-7',title:'무대 의상이 멋졌던 순간, 다들 언제야?',ownerKey:'sample-owner-7',caption:'노래도 좋지만 스타일링까지 취향이면 자꾸 다시 보게 되더라. 좋아하는 무대 이야기를 편하게 나눠 보자.',image:'',tags:['무대','팬이야기'],likes:18,views:246,comments:[],createdAt:'2026-11-14T10:00:00Z',topic:'연예인'},
  {id:'post-8',title:'주말 취미로 필름카메라 시작해 본 사람?',ownerKey:'sample-owner-8',caption:'천천히 걷고 사진 찍는 주말을 보내고 싶어. 처음 시작할 때 알면 좋을 팁이나 즐겨 하는 취미를 알려 줘!',image:'/images/cafe.jpg',tags:['사진','주말취미'],likes:11,views:128,comments:[],createdAt:'2026-11-14T09:00:00Z',topic:'취미'},
];
export const articles = [
  {id:'seoul-style',tag:'스타일 이야기',title:'단순하게 입어도, 나답게.',excerpt:'서울의 거리에서 찾은 일상 코디의 작은 힌트.',image:'/images/street.jpg',read:'읽는 시간 4분',paragraphs:['좋은 스타일은 눈에 띄는 옷 한 벌에서만 시작하지 않습니다. 잘 맞는 티셔츠, 편안한 바지, 좋아하는 소품이면 나만의 이야기를 만들 수 있어요.','블랙과 화이트, 에크루를 기본으로 두고 키링이나 작은 가방에 색을 더해 보세요. 작은 변화만으로도 익숙한 옷이 새롭게 느껴집니다.','유행보다 중요한 건 내게 편한 비율과 소재입니다. 넉넉한 셔츠와 일자 바지, 부드러운 면과 탄탄한 캔버스를 자유롭게 조합해 보세요.']},
  {id:'hanoi-cafe',tag:'도시 산책',title:'하노이에서 찾은 느긋한 한때.',excerpt:'혼자여도, 친구와 함께여도 좋은 카페에서의 시간.',image:'/images/cafe.jpg',read:'읽는 시간 3분',paragraphs:['좋아하는 음악과 커피 한 잔, 서두르지 않는 대화. 문화를 즐기는 방법은 이렇게 작고 일상적이기도 합니다.','자연광이 드는 자리를 찾아 책을 읽거나 잠깐 쉬어 보세요. 다른 사람이 사진에 들어간다면 먼저 동의를 구하는 것도 잊지 말고요.','좋아하는 공간이 있다면 익명 게시판에서 이야기를 나눠 주세요. 그곳이 특별한 이유가 누군가에게 새로운 영감이 될 수 있습니다.']},
  {id:'glow-diary',tag:'뷰티 노트',title:'나만의 속도로 빛나는 방법.',excerpt:'작은 습관으로 시작하는 일상의 자기 관리.',image:'/images/beauty-pink.jpg',read:'읽는 시간 3분',paragraphs:['오래 유지할 수 있는 습관이 좋은 습관입니다. 여러 제품을 한 번에 쓰기보다 피부 상태를 살피며 간단하게 시작해 보세요.','제품 설명을 읽고 작은 부위에 먼저 시험해 보세요. 자극이 생기면 전문가와 상담하는 것이 좋습니다. 이 글은 의료 조언을 대신하지 않습니다.','아름다움에 하나의 정답은 없습니다. GG-O는 각자의 취향과 모습을 편안하게 나누는 공간이 되고 싶습니다.']},
];
export const events:CommunityEvent[] = [
  {id:'hanoi-meetup',title:'하노이에서, 같이 가자!',label:'커뮤니티 만남',image:'/images/cafe.jpg',description:'한국 문화를 좋아하는 사람들이 커피와 이야기를 나누는 만남을 구상하고 있어요.',location:'하노이 · 장소 추후 안내',status:'기획 중'},
  {id:'k-music',title:'우리 취향으로 채우는 밤.',label:'한국 음악 모임',image:'/images/concert.jpg',description:'좋아하는 노래를 나누고 새로운 취향을 발견하는 음악 모임을 준비하고 있어요.',location:'하노이 · 일정 미정',status:'기획 중'},
];
// Testing language changes, but currency remains VND.
export const money = (amount:number) => `${new Intl.NumberFormat('ko-KR').format(amount)}동`;
export const dateLabel = (iso:string) => new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(iso));
