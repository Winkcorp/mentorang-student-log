# Supabase 프로젝트 연결 가이드

## 1. 프로젝트 생성 (1회)

1. [supabase.com](https://supabase.com) 가입 → **New Project**
2. 이름 예: `mentorang`, 리전: `Northeast Asia (Seoul)`, DB 비밀번호 기록해둘 것
3. 프로젝트 대시보드 → **Settings → API**에서 아래 3개 복사

## 2. .env.local 작성

프로젝트 루트에 `.env.local` 파일 생성 (`.env.local.example` 참고):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 3. 마이그레이션 적용

```bash
npx supabase login
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push
```

`db push`는 `supabase/migrations/`의 SQL을 순서대로 원격 DB에 적용한다.

## 4. (개발용) seed 데이터 넣기

SQL Editor(대시보드)에서 `supabase/seed.sql` 내용을 붙여넣고 실행.
운영 DB에는 넣지 말 것.

## 5. 최초 admin 계정 만들기

1. 앱 실행(`npm run dev`) → `/login`에서 회원가입
2. SQL Editor에서:

```sql
update public.profiles
set role = 'admin'
where email = '내이메일@example.com';
```

이후 계정 승인은 앱의 **관리자 → 계정 승인** 화면에서 처리 (SQL 불필요).

## 6. RLS 격리 검증 (Phase 4 필수)

```bash
node scripts/verify-rls.mjs
```

테스트 계정(rls-*@test.local)을 만들어 학부모 교차 접근·금지 테이블
접근을 실제로 시도하고 PASS/FAIL을 출력한다. 전부 PASS여야 다음 단계 진행.

## 참고

- 이메일 확인을 끄려면(개발 편의): Authentication → Providers → Email →
  "Confirm email" 비활성화
- service_role key는 절대 클라이언트/브라우저에 노출 금지
