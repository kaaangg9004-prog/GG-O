# 회원제 익명 시스템

## 1. SQL 전체 코드

`supabase/migrations/202611160008_member_anonymity.sql`이 실행 가능한 전체 SQL입니다. 신규 Supabase 프로젝트에서는 이 파일만으로 프로필·게시글·댓글·익명 매핑·신고·감사 로그와 해당 RPC를 생성합니다. 기존 GG-O 프로젝트에서는 001–007 다음에 적용합니다. 새 파일로 초기화했다면 나중에 001을 다시 실행하지 않습니다. 상점·고객지원·긴급·완전한 투표 관리까지 사용하는 기존 앱은 기존 migration 경로를 사용합니다.

전체 트랜잭션이 성공해야 권한 변경이 반영됩니다. 운영 데이터가 있는 프로젝트에서는 먼저 백업하고 스테이징에서 업그레이드를 검증합니다. 이 작업에서는 실제 Supabase 프로젝트에 SQL을 실행하지 않았습니다.

- `profiles.role`: user / admin. 클라이언트 수정 불가.
- `profiles.status`: active / suspended / banned. `suspended_until`이 지난 suspended 회원은 쓰기 검사에서 active로 취급합니다. banned는 날짜와 무관하게 차단합니다.
- 쓰기는 Google 제공자 계정 + 서버의 Google identity + 활성 회원 상태를 확인합니다. Facebook 로그인은 열람용으로 유지할 수 있지만 게시글/댓글 작성은 허용하지 않습니다.
- 게시글·댓글·투표 댓글의 원본 테이블은 브라우저에 SELECT/INSERT/UPDATE/DELETE 권한을 주지 않습니다. 기존의 **컬럼 단위 권한도 함께 회수**합니다. 방어용 쓰기 RLS도 회원 상태와 본인 소유 여부를 검사합니다.
- 읽기는 `anonymous_posts`, `anonymous_post`, `anonymous_comments` RPC를 사용합니다. 목록 RPC는 게스트도 호출할 수 있지만, 010 적용 후 본문·댓글 RPC는 로그인한 회원만 호출할 수 있습니다. 비회원 목록 응답의 body/image_path는 빈 값입니다. 작성자 식별 정보는 `is_mine`, `author_label` 두 가공 필드로만 공개합니다. `parent_id`는 공개 댓글 ID이며 회원 식별자가 아닙니다.
- 익명 번호는 `ggo_private.author_numbers`에 게시글/투표 단위로 영구 매핑합니다. 카운터 행 잠금으로 동시에 첫 댓글을 써도 중복 번호가 배정되지 않습니다. 글쓴이는 번호 배정에서 제외합니다. 댓글을 삭제/숨김 처리해도 기존 번호를 유지합니다.
- 원본 행을 Supabase Realtime 공개 publication에서 제거합니다. 원본을 공개하는 별도 View/RPC/Realtime 설정을 추가하지 않습니다.
- 과거 글은 작성 시점 IP를 복원할 수 없으므로 NULL입니다. 운영자 화면에 ‘기존 글 · IP 미수집’으로 표시합니다.

운영자를 최초 지정하려면 **Supabase SQL Editor에서 실제 Google 회원 UUID를 확인한 후** 다음을 실행합니다. AAAA/BBBB 브라우저 테스트 계정이나 사용자 metadata는 실서비스 관리자 권한이 아닙니다.

```sql
update public.profiles
set role = 'admin'
where id = '실제-Google-회원-UUID';
```

## 2. 서버 코드와 IP 수집

`backend/anonymous-api/src/index.ts`는 별도로 배포하는 Cloudflare Worker 전체 코드입니다. 정적 Next.js 호스팅을 유지하면서 서버에서 IP를 수집하기 위해 Worker를 사용합니다. 새 외부 계정/유료 서비스를 생성하거나 결제하지 않았으며 Worker는 아직 배포하지 않았습니다.

Worker는 Cloudflare 런타임의 `request.cf`가 있는 요청에서 플랫폼이 설정하는 `CF-Connecting-IP`만 읽습니다. 브라우저 JSON의 `user_id`/`ip_address`는 거절하며, 임의의 `X-Forwarded-For`는 사용하지 않습니다. 다른 런타임이나 로컬 환경에서 플랫폼 IP를 확인할 수 없으면 요청을 거절합니다. Vercel/Supabase Edge로 옮길 때는 그 플랫폼이 보장하는 IP 수집 방식으로 이 부분을 교체해야 합니다. 외부에서 임의로 설정할 수 있는 헤더를 그대로 신뢰하면 안 됩니다.

처리 순서:

1. 정확한 웹사이트 Origin 허용 목록, POST JSON과 실제 스트림 크기(24 KB)를 검사합니다.
2. 전달받은 OAuth access token을 Supabase `/auth/v1/user`에서 검증합니다. 클라이언트가 보낸 사용자 ID나 직접 디코딩한 미검증 JWT를 사용하지 않습니다.
3. 검증된 회원 ID와 플랫폼 IP를 서버 비밀 키로 `anonymous_trusted_write`에 전달합니다. 이 RPC는 service_role만 실행할 수 있습니다.
4. DB에서 회원 상태·Google identity·소유권·게시글 공개 상태·대댓글 부모의 게시글·투표 참여 여부를 다시 확인합니다. 회원 행을 잠가 제재와 쓰기 사이의 경쟁을 줄입니다.
5. 응답은 생성/변경된 콘텐츠 ID만 보냅니다. 원본 DB 오류, 회원 ID, IP, 토큰, 비밀 키를 브라우저에 전달하지 않습니다.

Worker 설정:

- 일반 변수: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS`
- 비밀 변수: `SUPABASE_SERVICE_ROLE_KEY` (`wrangler secret put`으로만 설정)
- 예: `ALLOWED_ORIGINS=https://gg-o-kculture.fitfern517.chatgpt.site,https://gg-o.com`
- 같은 호스트의 HTTPS Origin을 정확하게 적고, `*`는 사용하지 않습니다.
- `backend/anonymous-api/wrangler.toml`을 사용해 해당 Worker를 배포한 뒤 공개 URL만 `NEXT_PUBLIC_ANONYMOUS_API_URL`에 넣고 사이트를 다시 빌드합니다.
- service_role 키에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. `.dev.vars*`, `.env*` 및 `.wrangler/`는 커밋 대상에서 제외합니다.

## 3. React 프론트엔드 코드

- `src/components/member-board.tsx`: 목록, 로그인 없는 상세 열람, 글 작성/수정/삭제, 댓글·대댓글, 본인 수정/삭제, 신고, 운영자 전용 신고 뷰와 제재 확인 UI
- `src/lib/anonymous-types.ts`: 공개 데이터와 운영자 데이터 타입 분리
- `src/lib/anonymous-service.ts`: 안전한 읽기 RPC와 서버 경유 쓰기 호출. 공개 DTO는 반환 필드를 명시적으로 선택합니다.
- `src/components/experience.tsx`: Supabase 연결 시 회원 게시판을 홈/커뮤니티에 연결. 목록만 공개하고 글/댓글 본문은 로그인 후 열람. 비로그인 쓰기에는 기존 로고 로그인 팝업 사용.
- `src/components/polls.tsx`, `src/lib/poll-service.ts`: 투표 댓글도 같은 RPC/서버/컴포넌트를 사용하며, 투표에 참여해야 작성할 수 있습니다. 게스트에게 투표 본문·댓글·결과·본인 참여 내역은 공개하지 않습니다.

예시 사용:

```tsx
<MemberBoard
  authenticated={!!user}
  onRequireAuth={() => setLoginOpen(true)}
/>
```

프론트엔드의 버튼 숨김은 편의 기능입니다. `is_mine`과 `can_write`가 true여도 서버는 쓰기마다 권한을 재검사합니다. 익명 번호는 다른 게시글과 연결되지 않고, 언어에 따라 `Ẩn danh 1` / `익명 1` / `Anonymous 1`, 글쓴이는 `Ẩn danh (Tác giả)` / `익명(글쓴이)` / `Anonymous (Author)`로 표시합니다.

실서비스 API가 미설정된 테스트 사이트의 AAAA/0000(일반 사용자), BBBB/0000(운영자) 및 기기 저장 데이터는 기존 로컬 체험 모드입니다. 실제 회원 정보나 실제 IP를 모방해 만들어 내지 않습니다. 실계정 연결 후 서버 오류가 발생했다고 브라우저 저장 모드로 바꾸어 글을 저장하지 않습니다.

## 4. 운영자 처리

- `anonymous_admin_reports`: DB의 admin 역할/현재 상태를 확인한 뒤 신고 대상의 회원 UUID, 이메일, 작성 IP를 반환합니다. 일반 읽기 RPC와 구분하며 호출을 감사 로그에 기록합니다.
- `anonymous_admin_action`: `suspend_7d`, `ban`, `delete`, `dismiss`. 콘텐츠를 함께 삭제하는 옵션을 지원합니다.
- 자기 자신/다른 admin의 계정을 이 화면에서 제재하지 못합니다. 이미 영구 차단된 계정을 7일 정지로 낮추지 않습니다.
- 중복 요청은 정지 기간을 연장하지 않습니다. 같은 대상의 대기 신고는 한 번에 처리합니다. 자동 숨김된 게시글의 기각은 글을 복원하지만 이미 삭제한 콘텐츠를 복원하지 않습니다.
- 삭제는 공개 조회에서 즉시 제외하는 소프트 삭제입니다. 신고 확인에 필요한 원본/계정 연결과 감사 기록은 내부에 남습니다. 실제 출시 전 보관 기간·파기 작업·운영자 접근 절차를 확정하고 개인정보처리방침에 반영해야 합니다. SQL만으로 개인정보 법률 준수를 보장하는 것은 아닙니다.
- 일반 회원의 반복 신고는 DB 고유 제약으로 차단합니다. 서로 다른 회원의 게시글 신고 50건이 누적되면 우선 숨깁니다.

## 5. 검증 및 연결 범위

```bash
npm test
npm run test:database
npm run typecheck
npm run build
```

`test:database`는 실제 PostgreSQL 엔진인 PGlite에서 Supabase의 auth/storage 스키마를 최소한으로 구성해 SQL을 실행합니다. 원본 조회·역할 승격·직접 쓰기 우회 거절, 정지 만료와 영구 차단, 댓글 소유권, 번호 유지, 대댓글 경계, 투표 댓글, 신고 중복/50회 숨김, 운영자 감사, 기존 001–007 업그레이드와 재실행을 검사합니다. Supabase의 실 OAuth, 실제 Edge 헤더, 배포된 PostgREST 및 두 실계정으로 하는 최종 검증을 대신하지 않습니다.

Google/Facebook 제공자 설정과 callback 허용 목록은 `docs/SOCIAL-SIGNUP.md`를 따릅니다. 실제 Supabase 프로젝트의 공개 URL/key와 Worker 연결 정보가 아직 없으므로 실제 회원 인증·서버 게시판·공유 신고함의 운영 활성화는 미완료입니다. 현재 사이트 화면 배포와 서버 코드 준비를 구분해야 합니다.

## 회원 전용 열람 (010)

`202611160010_member_read_access.sql`을 009 다음에 적용합니다. 비회원은 홈·커뮤니티·TOP 글·투표의 목록만 둘러보고, 상세 클릭 시 기존 로고 로그인 팝업이 열립니다. 닫으면 목록에 머물고, 로그인하면 선택한 글을 이어서 읽습니다. 로그아웃하면 열린 상세 내용은 즉시 숨깁니다. 회원 본문·댓글의 user_id/IP 비공개 정책은 유지합니다.
