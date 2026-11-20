# GG-O 전체 소스 — v25 (2026-11-20)

이 압축파일은 배포된 v25 소스의 복사본입니다. 사이트 코드 자체는 변경하지 않았습니다.

## 먼저 실행하기
1. ZIP을 풀고 GG-O 폴더를 VS Code 등으로 여세요.
2. Node.js 24를 설치한 환경에서 터미널을 열고 실행하세요.

```sh
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 열면 됩니다. src 파일을 저장하면 개발 화면에 반영됩니다.
기본 로컬 개발은 서버 연결 없이 체험 모드입니다. 일반 사용자 AAAA / 0000, 체험 운영자 BBBB / 0000입니다.

## 실제 서버와 연결하기 (선택)
.env.example을 .env.local로 복사한 뒤 개발 서버를 다시 시작하세요.
Windows PowerShell: Copy-Item .env.example .env.local
macOS/Linux: cp .env.example .env.local
이 설정은 기존 운영 Supabase에 연결됩니다. 글 작성·삭제·관리 작업은 실제 데이터에 영향을 줍니다.
로컬 Google 로그인 테스트에는 Supabase Authentication → URL Configuration → Redirect URLs에
http://localhost:3000/auth/callback/ 을 추가해야 합니다. 운영 Site URL은 변경하지 마세요.
Google Cloud의 Supabase callback 주소도 그대로 유지합니다.

## 주요 파일
- src/components/experience.tsx: 홈 구성, 메뉴, 하단
- src/components/: 커뮤니티·소식·이벤트·관리자 등 화면
- src/app/globals.css: 디자인·반응형 스타일
- src/lib/locales/: 한국어·베트남어·영어 및 소개·정책 문서
- public/: 이미지, 로고, 폰트, 아이콘
- supabase/migrations/: 데이터베이스 구조와 권한 변경 SQL
- supabase/functions/: 현재 Supabase Edge Function 소스
- backend/anonymous-api/: 이전 별도 Worker 구현 (현재 운영 쓰기 API는 Supabase Edge Function)
- docs/SERVER-CONNECTION.md: 현재 서버 연결 현황과 인계 문서
- tests/: 자동 테스트, supabase/tests/: 서버 검증 SQL
- .env.example: 공개 연결값 예시
- .openai/hosting.json: 기존 Sites 배포 프로젝트 설정
- package.json, package-lock.json, next.config.ts, tsconfig.json: 실행 및 빌드 설정

## 현재 상태 및 문서 주의사항
Google 로그인 및 계정별 서버 동의 저장, 운영자 계정 권한 연결을 완료했습니다.
문의 이메일은 contact.us.ggo@gmail.com 입니다. Facebook 등록은 Meta 보안 제한으로 보류 중입니다.
원본 README.md와 일부 초기 docs 문서는 과거 체험 버전 설명이므로 현재 상태는 이 문서와
 docs/SERVER-CONNECTION.md를 우선 참고하세요.

## 검사 및 빌드
```sh
npm test
npm run typecheck
npm run build
```
빌드 결과는 out/에 생성됩니다. 로컬 파일 수정은 운영 사이트에 자동 반영되지 않습니다.
수정한 파일이나 ZIP을 이 대화에 전달하면 변경 내용을 검토하고 이어서 배포할 수 있습니다.
이 ZIP에는 Git 이력이나 원격 인증정보가 없습니다.

## 포함하지 않은 항목
node_modules, .next, out, .git, 캐시, 로그, 임시 파일, 빌드 압축파일, 실제 .env 비밀 설정을 제외했습니다.
회원·게시글 등 운영 데이터와 Google/Meta 비밀키, Supabase 대시보드 인증 설정은 포함하지 않습니다.
SQL은 구조를 재현하기 위한 파일입니다. 이미 적용된 운영 DB에 전체 마이그레이션을 재실행하지 마세요.
.env.example과 backend-config.ts의 publishable key는 공개 클라이언트용 값이며 서버 비밀키가 아닙니다.
소스 수정에는 포함된 이미지·폰트도 필요하므로 함께 제공했습니다.
