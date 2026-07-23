# 멘토랑 — 멘토링 학원 관리 시스템

Next.js 16 (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres/Auth/RLS)

## 역할

| 역할 | 접근 범위 |
|---|---|
| admin | 전체 데이터, 계정 승인, 정산 확정 |
| mentor | 담당 학생(assignments 기준)만 — 과제 체크, 세션 기록 |
| parent | 자녀 학습 정보 read-only (세션 노트·멘토 단가·정산은 차단) |

## 시작하기

```bash
npm install
npm run dev
```

Supabase 연결은 [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md) 참고
(프로젝트 생성 → `.env.local` → `npx supabase db push` → seed → 최초 admin).

## 검증

```bash
npm test                          # 단위 테스트 (생성 로직·정산 계산 등)
node scripts/verify-rls.mjs       # RLS 격리 실검증 (학부모 교차 접근 등 15항목)
node scripts/verify-settlement.mjs # 정산 멱등성·이중 정산 방지 실검증
```

## 문서

- [CLAUDE.md](CLAUDE.md) — 프로젝트 스펙 (스키마·정산 규칙·RLS 요구사항)
- [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) — Phase별 구현·검증 가이드
- [docs/SETUP_SUPABASE.md](docs/SETUP_SUPABASE.md) — Supabase 연결 런북

## 주요 구조

```
app/admin/      관리자 (학생·멘토·학부모·배정·템플릿·계획배정·예외일정·정산·계정승인)
app/mentor/     멘토 (내 학생·과제 체크·세션 관리)
app/parent/     학부모 (이번 주 학습 현황 — RLS 강제)
lib/plan/       학습 계획: config 검증·표 파싱·과제 생성 (순수 함수)
lib/settlement/ 정산 계산 (순수 함수)
supabase/       마이그레이션·seed
scripts/        실DB 검증 스크립트
```

## 롤아웃 메모

- 기존 구글 캘린더 운영과 **최소 1~2주 병행**하며 값 대조 후 전환
- 학생·멘토 기초정보는 admin 화면에서 수기 입력 (자동 마이그레이션 안 함)
- 과거 학습 이력은 옮기지 않고 사용 시작 시점부터 새로 쌓음
- Google Calendar 단방향 동기화(Phase 6)는 선택 — 미구현
