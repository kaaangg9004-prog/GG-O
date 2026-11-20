# 개발 현황과 다음 연결 단계

최신 회원제 익명 시스템·SQL·운영자 권한 및 연결 범위는 [MEMBER-ANONYMITY.md](MEMBER-ANONYMITY.md)를 우선 참고합니다. `/about/`, `/terms/`, `/privacy/`는 로그인 없는 독립 공개 페이지이며, 회원가입 동의는 매번 기본 해제입니다.

최신 커뮤니티 카테고리·TOP 글 점수·통합 관리자 및 서버 연결 방법은 [TOP-AND-ADMIN.md](TOP-AND-ADMIN.md)를 참고합니다.

비회원은 홈과 게시글·TOP 글·투표의 목록을 둘러볼 수 있습니다. 본문·댓글·투표 상세를 읽으려면 로고 로그인 팝업에서 로그인해야 합니다. 서버 연결 시에는 migration 010까지 적용해야 하며, 목록 RPC가 비회원에게 본문을 전달하지 않는지도 검증합니다.

## 확인한 요구사항

- 브랜드 GG-O, 한글 심볼 ㄱㄱㅇ
- 두 번째 스트리트 시안, 블랙·화이트·네온 그린 `#ADFF00`
- 베트남 Gen Z, 하노이 우선. 베트남어 기본, 한국어·영어 선택 지원
- 모바일 반응형 + 설치 가능한 PWA
- 한국 화장품·키링·에코백 등 자체 상품, 한국 → 베트남 배송
- 사진 투표 + 목록형 익명 게시판. 계정은 비공개이며, 글쓴이 표시와 게시글별 고정 익명 번호를 사용. 프로필·팔로우·DM·이용자 간 거래 제외
- 상점과 결제는 추후 재개. 현재는 운영자 상품 사진 투표와 익명 의견을 제공
- 최신 브랜드 문구 `K-Culture · Play · Community`

참고 대화:

- https://chatgpt.com/share/6af558bb-30f0-83ec-a3f7-b8c801ab5c86
- https://chatgpt.com/share/6af79b78-5df0-83e8-9e2f-6bd39e275075

사용자가 이번 대화에 첨부한 로고들을 참고해 헤더용 간결한 워드마크와 브랜드 영역용 그래피티 이미지를 정리했습니다. 최신 주석 요구가 이전 SNS·팔로우 및 베트남어 테스트 요구보다 우선합니다.

## 구조

- Next.js App Router + React + TypeScript
- Tailwind CSS 4 + 자체 반응형 CSS
- 정적 export, 사용자가 승인한 공개 테스트 배포. 플랫폼 ChatGPT 로그인 없이 사이트 자체 테스트 로그인 사용
- URL 해시 기반 화면 이동: `/#shop`, `/#community`, `/#my` 등
- 브라우저 저장소 키: `ggo-experience-v1`
- 서비스워커: 앱 셸은 네트워크 우선, 방문한 정적 자산은 캐시; API와 타 도메인 요청 제외

현재 `/#admin`은 이 브라우저의 신고 접수·게시글/댓글 숨김·기각·복원 테스트를 제공합니다. 실제 관리자 계정이나 서버 관리 권한을 뜻하지 않습니다. 개인 정보·비밀 키·다른 사용자의 주문은 포함하지 않습니다.

## Supabase 연결 준비

아래는 **준비된 코드이며 실서비스 연결은 미완료**입니다.

1. 사용자가 사용할 Supabase 프로젝트를 선택하고 비용 플랜을 확인합니다. 기존 프로젝트에 적용한다면 먼저 스키마와 백업을 점검합니다.
2. 새 프로젝트 기준으로 `supabase/migrations/202611140001_initial.sql`과 `202611140002_anonymous_board.sql`을 순서대로 검토·적용합니다. 001만 적용하면 이전 공개 프로필 구조가 남으므로 002가 반드시 필요합니다. migration은 기본 테이블 권한을 재설정하므로 기존 서비스 DB에 그대로 실행하지 않습니다.
3. 회원가입 이메일 확인을 활성화하고 사이트 URL·인증 redirect 허용 목록을 설정합니다. 이메일 발송 사업자와 발송 한도도 확인합니다.
4. `.env.example`을 참고하여 공개 URL과 공개 anon/publishable key만 빌드 환경에 설정합니다. `service_role`과 결제 비밀 키는 프런트엔드나 Git에 넣지 않습니다.
5. `src/lib/supabase-service.ts`의 서비스 함수를 UI의 로컬 저장 경로와 연결합니다. 로컬 데이터는 자동 업로드하지 말고 별도 동의를 받아 가져옵니다.
6. 서버 회원 상태·오류·로딩·이메일 확인·로그아웃 UI, 목록형 익명 게시판과 댓글 페이징을 완성합니다.
7. 서로 다른 두 계정 및 비로그인 상태로 RLS를 실제 테스트합니다. 남의 프로필·게시글 수정, 주문 조회, 관리자 승격, 가격·결제 상태 위조가 모두 거부되는지 확인합니다.
8. 실제 관리자 화면은 인증된 서버 경로와 별도 역할 검사 뒤 연결합니다. `/#admin` 개발 화면을 실제 운영 도구로 사용하지 않습니다.

테이블: profiles, user_roles, products, cart_items, favorites, posts, comments, likes, saved_posts, reports, orders, order_items. 기존 follows는 002에서 모든 클라이언트 접근 권한을 제거합니다. DM 테이블·기능은 없습니다.

이미지는 `community-media` 버킷에 작성자와 관계없는 무작위 객체명으로 올립니다. 공개 글·댓글은 소유자 UUID·닉네임·아바타·프로필 조인을 조회하지 않으며, 사진 URL에도 사용자 UUID 폴더를 포함하지 않습니다. 저장소 메타데이터 목록 조회는 업로더 본인에게만 허용합니다. 기존 UUID 폴더 사진이 있는 DB라면 익명 공개 전에 파일 이전이 필요합니다. 이미지 크기와 MIME 타입을 제한했습니다. 실제 출시 전 서버 측 이미지 검증, 메타데이터 처리, 업로드·게시 속도 제한 및 콘텐츠 관리 업무도 연결해야 합니다.

클라이언트는 가격·재고·관리자 역할·결제 상태·주문 합계를 쓸 수 없습니다. 실제 주문 작성은 신뢰할 수 있는 서버에서 재고를 잠그고 최종 가격·배송비·세금을 계산해야 합니다.

## 결제·배송에 필요한 중요한 결정

- 판매 사업자와 정산 계좌 국가
- 베트남 이용자에게 제공할 결제사 및 가맹점 승인
- 실제 상품·원가·가격·재고·성분·출처
- 국제배송사, 배송 가능 지역, 운임·관세·세금 부담 주체, 반품 정책

확정 후 서버 checkout endpoint, 멱등 키, 결제사 서명 검증 webhook, 상태 전이·재고 복구, 환불과 배송 추적을 구현하고 샌드박스에서 확인해야 합니다. 현재 `shopService.checkout()`은 명시적으로 실행을 거부합니다.

## 이번 검증

- 프로덕션 정적 빌드, TypeScript 검사
- DOM에서 색상 선택 → 대표 이미지·미리보기·장바구니 옵션 변경 확인
- 익명 글 작성 → 작성자 댓글 → 댓글 신고 → 관리자 숨김 → 게시판 반영 확인
- 옵션별 장바구니 합산·삭제·수량 경계값
- 잘못된 저장 데이터 복구, 댓글·신고·테스트 주문 재복원, 이전 색상 옵션 이전
- PWA 아이콘·오프라인 페이지와 상품·피드 이미지 참조
- 브라우저 UI 자동화 도구가 제공되지 않아 실제 브라우저 화면·터치 조작·설치·오프라인 전환은 검증하지 못했습니다.
- Supabase migration과 연동 함수는 아직 실제 프로젝트에서 실행·검증하지 않았습니다. 익명 API와 컬럼 권한, 이미지 URL·저장소 목록 접근, 관리자 RPC 권한을 두 계정·비로그인 상태로 검증해야 합니다.

## 출시 전 완료할 작업

1. 실물 상품·콘텐츠 적용과 제공 로고 최종 확인
2. Supabase 회원·공유 커뮤니티·운영 권한 연결 및 검증
3. 실제 주문·결제·배송 연결 및 검증
4. 모바일 실기기·데스크톱 브라우저 QA
5. 사업자·연락처·개인정보·이용약관·반품 정책 확정
6. 사용자 도메인과 공개 대상 결정

현재 사이트는 공개 테스트 버전이며 실제 고객 운영 서비스가 아닙니다. `AAAA / 0000`은 일반 사용자, `BBBB / 0000`은 운영자 시점의 체험용 클라이언트 로그인으로, 서버 인증이나 민감한 데이터 보호에 사용할 수 없습니다. 공개 배포물에서 소스 ZIP은 제외합니다.

## 2026-11-18: content-first public browsing

- Replaced the home poster pair with a compact introduction and prominent story feed, recent-story fallback, and question-led polls.
- Primary navigation is Home, Community, Polls, Events; help remains in the footer. Community defaults to TOP with selection rules collapsed.
- Demo articles, journal, events and poll questions are readable by guests. Writing, votes, reactions and private support still require authentication.
- Preserved black/lime/ivory branding and added readable mobile typography and four-item navigation.
- Validation: 123/124 full-suite tests passed; the remaining obsolete CTA selector was corrected and all 9 emergency tests then passed. TypeScript and static production build passed.
- Preview daemon was incompatible with Next.js CLI arguments; production browser QA follows deployment.
- Production remains a browser-local demo. No server environment keys are configured. Real shared accounts/activity require the existing Supabase backend setup, migrations and verified access policies. Live server public-read policies have not been implemented or validated; the live poll UI explicitly reports this limitation to guests.

## 2026-11-18: news, animation and event details

- Added Animation to community filters/composer and local persistence; prepared an additive Supabase category migration, not applied.
- Added News next to Home on desktop and mobile. News uses image cards and addressable detail views, admin-only local create/edit/delete, and signed-in per-story anonymous comments. Two introductory example articles explain the demo and new category.
- Event images, titles and detail links open addressable detail pages. Reactions moved from cards into details; login guards and existing persistence retained.
- Home now features news/event photography first, followed by polls and a reduced three-story community panel, then magazine cards.
- Validation: all 130 tests passed; includes permission checks, persistence, anonymous public projection and direct detail links. Production TypeScript/build and browser inspection are part of release checks.
- Still a browser-local demo: no shared backend or server-enforced News permissions have been deployed. Do not describe this as production-ready member storage or cross-device activity sync.
