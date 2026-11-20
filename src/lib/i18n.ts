import vietnamese from './locales/vi.json';
import english from './locales/en.json';
import {products,articles,events,seedPosts} from './data';

export type Locale='ko'|'vi'|'en';
export const LOCALE_KEY='ggo-language-v1';
export const defaultLocale:Locale='vi';
export const isLocale=(value:unknown):value is Locale=>value==='ko'||value==='vi'||value==='en';
const overrides:Record<Exclude<Locale,'ko'>,Record<string,string>>={
  vi:{
    '소셜 로그인을 준비 중입니다.':'Tính năng đăng nhập qua mạng xã hội đang được chuẩn bị.',
    '홈':'Trang chủ','이벤트':'Sự kiện','커뮤니티':'Cộng đồng','스토어':'Cửa hàng','긴급':'Khẩn cấp',
    '오늘의 취향,':'Gu hôm nay,','여기서 같이.':'Cùng sẻ chia.',
    '작은 물건,':'Món đồ nhỏ,','확실한 취향.':'Đúng gu riêng.',
    '작은 물건, 확실한 취향.':'Món nhỏ, đúng gu.',
    '취향은 자유롭게, 이야기는 편하게.':'Tự do thể hiện gu, thoải mái sẻ chia.',
    '좋아하는 것부터 사소한 일상까지.':'Từ điều bạn thích đến chuyện mỗi ngày.',
    '이름 없이 나누는 우리들의 이야기.':'Câu chuyện của chúng ta, không cần tên.',
    '나답게. 우리답게.':'Là chính mình. Là chúng ta.',
    '패션 · 뷰티 · 음악 · 일상':'Thời trang · Làm đẹp · Âm nhạc · Đời sống',
    '내 일상에 어울리는 한 가지.':'Một món đồ hợp với nhịp sống của bạn.',
    '스토어 둘러보기':'Khám phá cửa hàng',
    '유행을 넘어,':'Vượt trên xu hướng,','취향으로':'Kết nối bằng','연결되다.':'gu riêng.',
    '익명':'Ẩn danh','제품정보':'Thông tin sản phẩm','좋아요':'Thích','싫어요':'Không thích',
    '회원가입 시':'Khi đăng ký, tôi đồng ý với','및':'và','에 동의합니다.':'.',
    'GG-O · 한국 문화와 취향이 만나는 곳':'GG-O · Nơi văn hóa Hàn gặp gu riêng',
    '한국 문화 · 즐거움 · 커뮤니티':'Văn hóa Hàn · Niềm vui · Cộng đồng',
  },
  en:{
    '소셜 로그인을 준비 중입니다.':'Social sign-in is being set up.',
    '홈':'Home','이벤트':'Events','커뮤니티':'Community','스토어':'Store','긴급':'Emergency',
    '오늘의 취향,':'Your taste,','여기서 같이.':'Together here.',
    '작은 물건,':'Small finds,','확실한 취향.':'Distinct taste.',
    '작은 물건, 확실한 취향.':'Small finds. Distinct taste.',
    '취향은 자유롭게, 이야기는 편하게.':'Your taste, your voice. Make yourself at home.',
    '좋아하는 것부터 사소한 일상까지.':'From favorite things to everyday moments.',
    '이름 없이 나누는 우리들의 이야기.':'Our stories, shared anonymously.',
    '나답게. 우리답게.':'Be yourself. Be together.',
    '패션 · 뷰티 · 음악 · 일상':'Style · Beauty · Music · Life',
    '내 일상에 어울리는 한 가지.':'A little something for your everyday.',
    '스토어 둘러보기':'Explore the store',
    '유행을 넘어,':'Beyond trends,','취향으로':'Connected by','연결되다.':'taste.',
    '익명':'Anonymous','제품정보':'Product information','좋아요':'Like','싫어요':'Dislike',
    '회원가입 시':'By signing up, I agree to the','및':'and','에 동의합니다.':'.',
    'GG-O · 한국 문화와 취향이 만나는 곳':'GG-O · Where Korean culture meets your taste',
    '한국 문화 · 즐거움 · 커뮤니티':'Korean culture · Play · Community',
  },
};
const dictionaries:Record<Exclude<Locale,'ko'>,Record<string,string>>={
  vi:{...(vietnamese as Record<string,string>),...overrides.vi},
  en:{...(english as Record<string,string>),...overrides.en},
};
// Keep existing locale keys when display copy changes.
const originalKeys:Record<string,string>={
  "GG-O 상품 참고 이미지": "GG-O 개발용 상품 이미지",
  "예시 고객 · 베트남 하노이": "GG-O 체험 고객 · 베트남 하노이",
  "{{0}}님의 요청 예시": "{{0}}님의 테스트 요청",
  "가방이나 열쇠에 작은 포인트를 더하는 스트랩 키링 콘셉트입니다.\n\n네온 그린, 클라우드 화이트, 올 블랙을 골라 나에게 맞는 조합을 비교해 보세요.\n\n사진과 재고는 예시이며 실제 구성과 소재는 판매 전에 안내합니다.": "가방이나 열쇠에 작은 포인트를 더하는 스트랩 키링 콘셉트입니다.\n\n네온 그린, 클라우드 화이트, 올 블랙을 골라 나에게 맞는 조합을 비교해 보세요.\n\n사진과 재고는 개발 테스트용이며 실제 구성과 소재는 판매 전에 안내합니다.",
  "같은 탭에서 긴급 요청 예시를 작성하면 여기에 표시됩니다.": "같은 탭에서 긴급 요청을 테스트로 등록하면 여기에 표시됩니다.",
  "GG-O": "개발 테스트 버전",
  "개인정보는 적지 말아 주세요. 작성한 글은 현재 브라우저에만 저장됩니다.": "개인정보는 적지 말아 주세요. 테스트 글은 현재 브라우저에만 저장됩니다.",
  "고객지원 미리보기 · 실제 개인정보를 입력하지 마세요.": "고객지원 체험 · 실제 개인정보를 입력하지 마세요.",
  "이 브라우저에 저장된 문의을 읽지 못했습니다. 브라우저 저장 설정을 확인해 주세요.": "고객지원 테스트 저장 내용을 읽지 못했습니다. 브라우저 저장 설정을 확인해 주세요.",
  "교환·반품 가능 기간과 조건, 비용은 실제 판매 전에 안내합니다. 현재 주문 예시은 실제로 배송되지 않습니다.": "교환·반품 가능 기간과 조건, 비용은 실제 판매 전에 안내합니다. 현재 테스트 주문은 실제로 배송되지 않습니다.",
  "국제배송을 준비하고 있습니다. 배송비, 예상 기간, 관세와 세금은 정식 판매 전에 안내합니다. 주문 예시은 실제로 배송되지 않습니다.": "국제배송을 준비하고 있습니다. 배송비, 예상 기간, 관세와 세금은 정식 판매 전에 안내합니다. 테스트 주문은 실제로 배송되지 않습니다.",
  "긴급 요청 미리보기": "긴급 요청 테스트",
  "요청 예시 보관함": "긴급 요청함 (테스트)",
  "요청 예시 보관함.": "긴급 요청함 (테스트).",
  "요청 예시 보기": "긴급 요청함 보기 (테스트)",
  "노트북과 책, 좋아하는 것들을 담는 넉넉한 캔버스 토트백입니다. 에크루 바탕에 블랙 로고, 블랙 바탕에 화이트 로고를 직접 비교해 보세요. 판매 전 공개한 상품 콘셉트입니다.": "노트북과 책, 좋아하는 것들을 담는 넉넉한 캔버스 토트백입니다. 에크루 바탕에 블랙 로고, 블랙 바탕에 화이트 로고를 직접 비교해 보세요. 실물 상품이 아닌 개발용 예시입니다.",
  "노트북과 책, 하루에 필요한 물건을 담는 데일리 토트백입니다.\n\n에크루 바탕의 블랙 로고와 블랙 바탕의 화이트 로고를 옵션에서 비교해 보세요. 가벼운 차림에도 자연스럽게 어울리는 GG-O의 가방 콘셉트입니다.\n\n현재 이미지는 상품 참고 이미지이며, 실물의 소재·크기·구성은 정식 판매 전에 확정합니다.": "노트북과 책, 하루에 필요한 물건을 담는 데일리 토트백입니다.\n\n에크루 바탕의 블랙 로고와 블랙 바탕의 화이트 로고를 옵션에서 비교해 보세요. 가벼운 차림에도 자연스럽게 어울리는 GG-O의 가방 콘셉트입니다.\n\n현재 이미지는 개발용 콘셉트이며, 실물의 소재·크기·구성은 정식 판매 전에 확정합니다.",
  "님의 요청 예시": "님의 테스트 요청",
  "로그인한 계정": "로그인한 테스트 계정",
  "매일의 피부 관리를 위한 기초 세트 예시입니다. 사진과 가격은 판매 전 참고 정보입니다.": "매일의 피부 관리를 위한 기초 세트 예시입니다. 사진과 가격은 화면 테스트용이며 실제 판매 상품이 아닙니다.",
  "작성 내용 확인": "메세지보내기 (테스트)",
  "문의와 답변은 이 브라우저에만 저장됩니다. 비밀번호 확인과 운영자 화면을 미리 볼 수 있으며, 실제 회원 보호·공용 문의 수신은 서버 연결 후 활성화됩니다.": "문의와 답변은 이 브라우저에만 저장됩니다. 비밀번호 확인과 운영자 화면을 체험할 수 있으며, 실제 회원 보호·공용 문의 수신은 서버 연결 후 활성화됩니다.",
  "스토어 관리": "스토어 운영 테스트",
  "신고 관리 열기": "신고 관리 테스트 열기",
  "신고 내용을 확인하고 처리할 수 있습니다.": "신고 접수·조치 흐름을 직접 테스트해 보세요.",
  "결제 없는 주문 미리보기": "실제 결제 없는 주문 테스트",
  "실제 결제·판매자 전송·배송은 진행되지 않습니다. 내 보관함에서 주문 예시을 확인할 수 있습니다.": "실제 결제·판매자 전송·배송은 진행되지 않습니다. 내 보관함에서 테스트 주문을 확인할 수 있습니다.",
  "실제 결제와 배송이 없는 주문 예시임을 확인했습니다.": "실제 결제와 배송이 없는 테스트 주문임을 확인했습니다.",
  "실제 회원 가입일이나 결제 내역이 아닌 현재 기기의 예시 정보입니다.": "실제 회원 가입일이나 결제 내역이 아닌 현재 기기의 테스트 정보입니다.",
  "요청을 보내려면 회원 계정으로 로그인해 주세요.": "실제 회원 계정으로 로그인이 필요합니다. 테스트 계정은 전송할 수 없습니다.",
  "아직 주문 예시이 없습니다.": "아직 테스트 주문이 없습니다.",
  "요청 작성 미리보기": "요청 테스트하기",
  "운영 화면 미리보기": "운영자 체험 중",
  "미리보기에는 관리자 권한이 부여되지 않습니다.": "운영자 화면 체험은 실제 관리자 인증이 아닙니다.",
  "이 탭에서 등록한 요청 예시의 내용과 처리 상태를 확인하세요.": "이 탭에서 등록한 테스트 요청의 내용과 처리 상태를 확인하세요.",
  "이 탭의 요청 예시": "이 탭의 테스트 요청",
  "이 탭의 요청 예시 {{0}}건 · 최근 50건까지 보관": "이 탭의 테스트 요청 {{0}}건 · 최근 50건까지 보관",
  "이 탭의 요청 예시 보관함에서 내용을 확인할 수 있습니다. 새로고침·로그아웃 시 삭제됩니다.": "이 탭의 테스트 요청함에서 내용을 확인할 수 있습니다. 새로고침·로그아웃 시 삭제됩니다.",
  "이름·연락처 등은 예시로 입력해 주세요. 동의 후 미리보기 완료 화면을 확인할 수 있으며 실제 접수는 되지 않습니다.": "이름·연락처 등은 예시로 입력해 주세요. 동의 후 테스트 완료 화면을 확인할 수 있으며 실제 접수는 되지 않습니다.",
  "새 글·댓글·신고는 현재 브라우저에 저장됩니다.": "익명 게시판 테스트입니다. 새 글·댓글·신고는 현재 브라우저에 저장됩니다.",
  "일상에서 부담 없이 즐길 수 있는 세 가지 립 컬러 콘셉트입니다.\n\n서울 로즈, 피치 무드, 체리 온을 선택해 패키지 색상을 비교할 수 있습니다. 화면에서 보이는 색은 실제 발색을 보장하지 않습니다.\n\n판매 전 공개한 상품 콘셉트입니다. 실제 판매 전에 전성분, 용량, 사용 기한, 주의사항을 안내합니다.": "일상에서 부담 없이 즐길 수 있는 세 가지 립 컬러 콘셉트입니다.\n\n서울 로즈, 피치 무드, 체리 온을 선택해 패키지 색상을 비교할 수 있습니다. 화면에서 보이는 색은 실제 발색을 보장하지 않습니다.\n\n현재는 화면 테스트용 상품입니다. 실제 판매 전에 전성분, 용량, 사용 기한, 주의사항을 안내합니다.",
  "작성과 동의를 마쳤습니다.": "작성·동의 테스트를 완료했습니다.",
  "장바구니": "장바구니 테스트",
  "접수한 내용은 신고 관리 화면에서 확인·처리할 수 있습니다. 게시글 신고는 1인 1회이며 서로 다른 이용자의 신고 50건이 쌓이면 우선 숨김 처리됩니다. 실제 회원별 집계는 서버 연결 후 활성화됩니다.": "접수한 내용은 신고 관리 테스트 화면에서 확인·처리할 수 있습니다. 게시글 신고는 1인 1회이며 서로 다른 이용자의 신고 50건이 쌓이면 우선 숨김 처리됩니다. 실제 회원별 집계는 서버 연결 후 활성화됩니다.",
  "주문 과정 미리보기": "주문 과정 테스트하기",
  "예시 개인정보 수집·이용 동의 기록": "테스트 개인정보 수집·이용 동의 기록",
  "운영자만 접수 목록과 내용을 확인할 수 있습니다.": "테스트 계정과 일반 회원은 접수 목록과 내용을 볼 수 없습니다.",
  "미리보기에서는 메시지를 전송하지 않습니다.": "테스트 계정에서는 실제 메시지를 전송하지 않습니다.",
  "예시 구매 내역": "테스트 구매 내역",
  "긴급 요청 예시": "테스트 긴급 요청",
  "긴급 요청 예시 상태": "테스트 긴급 요청 상태",
  "요청 작성 미리보기입니다. 실제 개인정보를 입력하지 마세요.": "테스트 등록 화면입니다. 실제 개인정보를 입력하지 마세요.",
  "예시 배송지": "테스트 배송지",
  "요청 예시은 이 탭에서만 임시로 보관하며 실제 운영자에게 전달하지 않습니다.": "테스트 요청은 이 탭에서만 임시로 보관하며 실제 운영자에게 전달하지 않습니다.",
  "요청 예시 보관함의 내용은 새로고침·로그아웃 시 삭제됩니다.": "테스트 요청함의 내용은 새로고침·로그아웃 시 삭제됩니다.",
  "미리보기 시작일": "테스트 이용 시작일",
  "작성 예시 ·": "테스트 접수 ·",
  "작성 예시 · {{0}}": "테스트 접수 · {{0}}",
  "주문 예시": "테스트 주문",
  "주문 예시 · 미결제": "테스트 주문 · 미결제",
  "주문 예시 보기": "테스트 주문 보기",
  "주문 예시 저장": "테스트 주문 생성",
  "주문 예시 확인": "테스트 주문 확인",
  "주문 예시를 저장했어요.": "테스트 주문이 완료됐어요.",
  "예시 회원 정보": "테스트 회원 정보",
  "사진은 1MB 이하로 올려 주세요.": "테스트에서는 1MB 이하 사진을 올릴 수 있습니다.",
  "미리보기에서는 입력 내용을 저장하거나 운영자에게 전달하지 않습니다.": "테스트에서는 입력 내용을 저장하거나 운영자에게 전달하지 않습니다.",
  "표시할 요청 예시이 없습니다.": "표시할 테스트 요청이 없습니다.",
  "이 브라우저에만 저장되는 예시 문의입니다. 실제 주문번호·주소·연락처 등 개인정보를 적지 마세요.": "현재 브라우저의 체험용 문의입니다. 실제 주문번호·주소·연락처 등 개인정보를 적지 마세요.",
  "상품 변경 사항은 이 브라우저에 저장됩니다.": "현재 브라우저의 테스트 상품 관리입니다.",
  "현재는 예시 상품이며 실제 결제는 진행되지 않습니다.": "현재는 테스트 상품이며 실제 결제는 진행되지 않습니다.",
  "요청 미리보기 화면입니다. 신고 접수나 공공기관 연락은 이루어지지 않습니다.": "현재는 테스트 화면이며 실제 신고·공공기관 연락은 진행되지 않습니다.",
  "이벤트를 둘러보고 반응을 남길 수 있습니다. 참가 신청과 결제는 준비 중입니다.": "현재는 이벤트와 반응을 테스트하는 화면입니다. 참가 신청과 결제는 아직 열리지 않았습니다.",
  "예시 콘텐츠 · 활동은 기기에 저장": "공개 테스트 버전 · 예시 콘텐츠 · 활동은 기기에 저장",
  "요청 관리 미리보기": "BBBB 테스트 관리자",
  "설정과 콘텐츠 변경은 이 브라우저에 저장됩니다.": "브라우저 체험 모드 · 설정과 콘텐츠 변경은 이 브라우저에 저장됩니다.",
  "예시 게시글": "예시 게시글 · 공개 테스트",
  "소식과 댓글은 현재 브라우저에 저장됩니다.": "공개 테스트 · 소식과 댓글은 현재 브라우저에 저장됩니다.",
  "회원 활동은 서버에 저장됩니다.": "서버 연결 테스트 · 회원 활동은 서버에 저장됩니다."
};
for(const dictionary of Object.values(dictionaries)){
  for(const [current,original] of Object.entries(originalKeys)){
    if(dictionary[original]!==undefined)dictionary[current]=dictionary[original];
  }
}
const escape=(text:string)=>text.replace(/[.*+?^$(){}|[\]\\]/g,'\\$&');
const presetValues=new Set([...products.flatMap(product=>[product.name,product.brand,...product.variants.map(variant=>variant.label)]),...articles.map(article=>article.title),...events.map(event=>event.title),...seedPosts.map(post=>post.title),'구글','페이스북']);
const compiled=new Map<Locale,{regex:RegExp;indices:string[];target:string;key:string}[]>();
function patterns(locale:Exclude<Locale,'ko'>) {
  const existing=compiled.get(locale);if(existing)return existing;
  const result=Object.entries(dictionaries[locale]).filter(([key])=>key.includes('{{')).sort(([a],[b])=>b.replace(/\{\{\d+\}\}/g,'').length-a.replace(/\{\{\d+\}\}/g,'').length).map(([key,target])=>{
    const indices:string[]=[];let regex='',at=0;
    for(const match of key.matchAll(/\{\{(\d+)\}\}/g)){regex+=escape(key.slice(at,match.index))+'([\\s\\S]*?)';indices.push(match[1]);at=match.index!+match[0].length;}
    return {regex:new RegExp('^'+regex+escape(key.slice(at))+'$'),indices,target,key};
  });compiled.set(locale,result);return result;
}
function special(text:string,locale:Exclude<Locale,'ko'>):string|null {
  const votes=text.match(/^(\d+)표$/);if(votes)return locale==='vi'?votes[1]+' phiếu':votes[1]+(votes[1]==='1'?' vote':' votes');
  const participants=text.match(/^(\d+)명 참여$/);if(participants)return locale==='vi'?participants[1]+' người tham gia':participants[1]+(participants[1]==='1'?' participant':' participants');
  const money=text.match(/^([\d,]+)동$/);
  if(money)return new Intl.NumberFormat(locale==='vi'?'vi-VN':'en-US').format(Number(money[1].replaceAll(',','')))+(locale==='vi'?' ₫':' VND');
  const date=text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d\d)$/);
  if(date){const hour=Number(date[4])%12+(date[3]==='오후'?12:0),time=String(hour).padStart(2,'0')+':'+date[5];return locale==='vi'?date[2]+'/'+date[1]+' '+time:date[1]+'/'+date[2]+' '+time;}
  const fullDate=text.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if(fullDate)return new Intl.DateTimeFormat(locale==='vi'?'vi-VN':'en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+fullDate[1],+fullDate[2]-1,+fullDate[3])));
  return null;
}
export function translateText(text:string,locale:Locale):string {
  if(locale==='ko'||!/[가-힣]/.test(text))return text;
  const leading=text.match(/^\s*/)?.[0]??'',trailing=text.match(/\s*$/)?.[0]??'',key=text.trim(),dictionary=dictionaries[locale];
  const exact=dictionary[key];if(exact!==undefined)return leading+exact+trailing;
  const formatted=special(key,locale);if(formatted!==null)return leading+formatted+trailing;
  if(key.length<1500)for(const pattern of patterns(locale)){
    const match=key.match(pattern.regex);if(!match)continue;
    const values:Record<string,string>={};pattern.indices.forEach((index,i)=>{const raw=match[i+1];values[index]=special(raw,locale)??(!pattern.key.includes('님의')&&(presetValues.has(raw)||pattern.key==='{{0}} 게시판')?dictionary[raw]:undefined)??raw;});
    return leading+pattern.target.replace(/\{\{(\d+)\}\}/g,(_,index)=>values[index]??'')+trailing;
  }
  const pieces=key.split(/(\s+[·↔→]\s+)/);
  if(pieces.length>1)return leading+pieces.map(piece=>dictionary[piece]??special(piece,locale)??piece).join('')+trailing;
  return text;
}
export const localizedImage=(source:string,locale:Locale)=>locale!=='ko'&&/^\/images\/(tote(?:-black)?|tint(?:-peach|-cherry)?|pouch(?:-black)?)\.svg$/.test(source)?source.replace(/\.svg$/,'.'+locale+'.svg'):source;
