# 소셜 회원가입 및 약관 동의

## 현재 구현

- `/signup/`: 구글·페이스북 계정 선택, 문서 팝업, 필수 동의, 가입 진행 버튼
- 로그인 화면의 소셜 버튼과 회원가입 링크는 이 페이지로 연결
- `/about/`, `/privacy/`, `/terms/`: 독립 공개 경로, 제공된 한국어·베트남어 원문과 영어 번역
- `/auth/callback/`: Supabase 소셜 인증 후 사용자 확인 및 동의 확인
- 실제 소셜 인증이 확인되어야 소셜 계정으로 로그인 처리. 연결되지 않은 버튼을 누른다고 테스트 계정을 발급하거나 가입 완료로 표시하지 않음
- 커뮤니티 표시 이름은 소셜 계정 정보와 관계없이 계속 익명

## 무료 기본 동의 저장: Local Storage

키는 `ggo-registration-consent-v1`입니다.

```json
{
  "version": "2026-11-16",
  "accepted": true,
  "acceptedAt": "동의 시점의 ISO 시각",
  "updatedAt": "마지막 변경 시점의 ISO 시각"
}
```

회원가입 페이지를 새로 열면 기존 동의 기록이 있어도 체크박스는 항상 해제되어 있습니다. 사용자가 직접 체크해야 가입 버튼이 활성화됩니다. 이전 기록을 읽었다는 이유로 체크하지 않으며, 페이지를 열었다는 이유만으로 이전 동의 기록을 철회하지도 않습니다.

동의 체크 변경 시 저장하며, 동의 해제 시 `accepted`는 false, `acceptedAt`는 null로 바꿉니다. 저장에 실패하면 체크를 해제하고 가입을 차단합니다. 버전이 다른 기록은 현재 동의로 인정하지 않습니다. 약관 개정 시 `src/lib/legal.ts`의 `LEGAL_VERSION`을 갱신합니다.

계정 인증 중간 정보는 세션 키 `ggo-oauth-pending-v1`에 제공자·약관 버전·시작 시각만 저장하고 30분 후 무효로 봅니다. 인증이 실패하면 진행 상태를 제거합니다. 비밀번호, 소셜 비밀 키, 회원의 이름·사진은 이 동의 기록에 넣지 않습니다.

이 방식은 **브라우저별 테스트 동의 기록**입니다. 데이터 삭제·다른 기기 사용 시 복원되지 않고 서버의 회원별 동의 감사 기록을 대신하지 않습니다. 실제 운영에 중앙 동의 이력이 필요해지면 동일 구조를 Supabase의 사용자별 권한 테이블로 옮길 수 있습니다. 이번 작업에서 유료 리소스나 별도 프로젝트를 생성하지 않았습니다.

## 현재 실제 구글·페이스북 인증은 미연결

이 작업 환경에는 Supabase URL·공개 키 및 소셜 앱 연결 정보가 없습니다. 따라서 현재 공개 사이트에서는 가입 화면과 동의 저장을 시험할 수 있지만 실제 소셜 인증은 시작하지 않고 ‘연결 준비 중’ 안내를 표시합니다. 테스트 계정은 일반 사용자 `AAAA / 0000`, 운영자 `BBBB / 0000`으로 구분합니다. 두 계정은 실제 소셜 회원/서버 관리자 권한을 발급하지 않습니다.

## 활성화에 필요한 외부 설정

1. 사용할 Supabase 프로젝트를 선택합니다. `.env.example`의 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`에 공개 연결 정보만 설정하고 다시 빌드합니다. 비밀 키·service role 키는 프런트엔드에 넣지 않습니다.
2. Supabase Authentication의 Site URL을 아래 사이트 원점으로 설정하고 Redirect URLs에 아래 콜백 URL을 허용합니다.
   - 사이트: `https://gg-o-kculture.fitfern517.chatgpt.site`
   - 콜백: `https://gg-o-kculture.fitfern517.chatgpt.site/auth/callback/`
3. Google Cloud에서 웹 OAuth 앱을 등록합니다. 앱의 승인 리디렉션 URI는 해당 Supabase 프로젝트의 `https://<프로젝트>.supabase.co/auth/v1/callback`입니다. 클라이언트 ID·Secret은 Supabase의 Google Provider 설정에 넣고 활성화합니다.
4. Meta 앱에 Facebook Login을 추가합니다. 유효 OAuth 리디렉션 URI는 같은 Supabase 콜백입니다. 앱 ID·Secret은 Supabase의 Facebook Provider 설정에 넣습니다. 앱의 공개/테스트 사용자 상태, 요구되는 검수·개인정보·탈퇴 요건을 실제 Meta 콘솔에서 확인합니다.
5. 공개 문서 주소는 사이트의 `/privacy/`, `/terms/`입니다. 실제 운영자의 정보 및 운영 기능과 정책이 맞는지 정식 출시 전에 확정합니다.
6. 실제 두 제공자에서 승인·취소·재방문·로그아웃·동의 해제/개정 후 재동의를 브라우저에서 검증합니다.

Supabase SDK의 PKCE를 사용하며 콜백 주소는 사이트의 고정된 내부 경로입니다. 사이트 로그인 상태는 검증된 `auth.getUser()` 결과로 복원합니다. 본인의 이메일은 내 보관함에만 표시하고 익명 게시글·댓글에는 연결하지 않습니다.

## 관련 파일

- `src/components/signup.tsx`, `social-buttons.tsx`, `oauth-callback.tsx`
- `src/lib/legal.ts`, `registration-consent.ts`, `social-auth.ts`
- `src/components/demo-access.tsx`, `src/lib/supabase-service.ts`

회원제 익명 게시판과 운영자 권한/서버 경유 IP 수집은 `docs/MEMBER-ANONYMITY.md`를 참고합니다.
