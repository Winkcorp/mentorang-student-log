# 멘토링 학원 시스템 — Phase별 실행 가이드

각 Phase는 **구현 → 검증 → 문제없으면 커밋 → 다음 Phase** 순서로 진행한다. 검증을 건너뛰지 않는다.

## Phase 0 — 사전 준비

- Node.js 설치, Next.js(App Router)+TypeScript+Tailwind 스캐폴딩
- `@supabase/supabase-js`, `@supabase/ssr`, `supabase`(CLI, devDep) 설치
- Supabase 프로젝트 생성(supabase.com) + `.env.local`에 URL/anon key/service_role key 저장
- CLAUDE.md 프로젝트 루트에 저장

## Phase 1 — DB 스키마 + 마이그레이션

**구현**: CLAUDE.md 스키마대로 `supabase/migrations`에 SQL 작성.

1. 모든 PK는 UUID(`gen_random_uuid()` 기본값), 모든 테이블에 created_at·updated_at(자동 갱신 트리거 포함)
2. students, mentors에는 status 컬럼(active/inactive) — 하드 삭제 금지
3. FK 삭제 정책: sessions/tasks/settlements → student/mentor 참조는 ON DELETE RESTRICT, 순수 연결 테이블(assignments/template_tasks)만 ON DELETE CASCADE
4. 금액·시간 컬럼(rate_amount, amount, adjustment_amount, total_hours)은 numeric(10,2)
5. status류 컬럼은 전부 CHECK 제약
6. RLS는 아직 켜지 말 것
7. 테스트용 seed.sql(학생 2명, 멘토 1명, 세션 몇 개) 별도 작성

**검증**: (1) 모든 FK에 ON DELETE 정책 명시 여부, (2) 금액 컬럼 float 오입 여부, (3) CHECK 제약 빠진 status 컬럼 여부를 표로 점검.

## Phase 2 — 인증 + 역할(Role) 라우팅

**구현**:

1. auth.users row 생성 시 자동으로 profiles row를 만드는 DB 트리거(handle_new_user) — 앱 코드에서 수동 생성 금지
2. profiles: id(auth.users 참조), role(admin/mentor/parent, 기본값 null), mentor_id(nullable FK), parent_id(nullable FK)
3. role=null 계정은 "승인 대기 중" 화면만 — role 부여는 admin이 수동
4. 라우팅은 Next.js middleware에서 서버사이드 role 체크 (URL 직접 접근 우회 방지)
5. service_role key는 서버 전용 코드에서만, 그 외 전부 anon key로 RLS 적용

**검증**: service_role key 사용 파일 전수 확인. 비로그인/role=null 상태로 /admin, /mentor, /parent 직접 접근 차단 확인.

## Phase 2.5 — 기존 학생·멘토 데이터 입력 (코드 작업 아님)

Admin 화면 완성 후 구글 캘린더의 학생·멘토·담당관계를 직접 입력. 자동 마이그레이션 스크립트 만들지 않음. 과거 이력은 옮기지 않음.

## Phase 3 — 콘텐츠 자동화 ① 템플릿 구조 확장

**구현**:

- template_tasks에 item_type(CHECK) + config(jsonb), tasks에 related_task_id(self-FK, ON DELETE SET NULL), exceptions 테이블 신규
- 템플릿 생성 화면: item_type 선택 시 유형별 config 입력 폼 (daily_routine=instruction 한 줄 / sequential=range·주기·복습텀 숫자 / conditional=trigger·action 두 줄 / one_time=주차·요일·내용)
- one_time은 GPT 학습플랜 표 붙여넣기 일괄 파싱 — 실패한 행은 조용히 무시하지 말고 몇 번째 행인지 표시
- "학생+템플릿+시작일 배정" 시: ① 시작일 월요일 강제 ② 겹치는 기존 tasks N개 확인 후 덮어쓰기 ③ exceptions 겹침 확인 후 해당 날짜 제외

**검증**: config에 item_type과 안 맞는 값 거부 여부, 시작일 검증·exceptions 겹침 감지 동작 테스트.

## Phase 3.5 — 콘텐츠 자동화 ② 유형별 생성 로직

**구현**:

1. **daily_routine**: 배정 기간 모든 날짜(exceptions 제외)에 config.instruction으로 매일 생성
2. **sequential**: units_per_period·period_days 기준 범위 순차 이동. 학습 과제 done 시 review_lag_days 뒤에 복습 task 자동 생성 + related_task_id 연결. 복습 날짜가 exceptions와 겹치면 다음 가용일로
3. **conditional**: 매일 트리거 확인용 task만 생성. done으로 바뀌는 순간 같은 날짜에 액션 task 생성 + related_task_id 연결 — 트리거 체크 전 액션 task 존재 금지
4. **one_time**: week_number/day_of_week 기준 단일 생성

제목은 저장하지 않고 항상 계산 (예: "{세션유형}_{요일}_{현재주}/{총주}_{멘토명}M_{학생명}").

**검증**: sequential 완료→복습 생성, conditional 트리거 전 액션 부재→체크 즉시 생성, 두 경우 exceptions 회피 테스트.

## Phase 4 — 학부모 뷰 (RLS — 제일 꼼꼼히 확인할 단계)

**구현**:

1. tasks, sessions 각각 parent용/admin·mentor용 정책 명시적 분리 — parent 정책이 admin/mentor 접근을 막지 않는지 점검
2. sessions는 notes 제외한 parent_sessions_view로만 parent 조회 (컬럼 숨김은 뷰 필요)
3. mentors.rate_amount/rate_type, settlements는 parent가 어떤 경로로도 접근 불가
4. /parent 페이지: 이번 주(월~일) tasks, 완료율(%), 담당 mentor 이름만
5. 모든 요청이 anon key 기반(RLS 적용)인지, service_role 우회 없는지 점검

**검증 (가장 중요)**: parent 테스트 계정 2개로 A 학부모 로그인 상태에서 B 학생 tasks·sessions를 URL 조작/직접 API 호출로 시도. mentors.rate_amount·settlements 접근 시도도 차단 확인.

## Phase 5 — 정산 자동화

**구현**: mentor 세션 체크 화면 + 월별 정산 배치. CLAUDE.md "정산 규칙" 준수.

1. 같은 mentor+period 재실행 시 중복 레코드 금지(기존 있으면 재계산 후 업데이트)
2. makeup 세션은 related_session_id 원본과 이중 정산 금지
3. rate_type별 계산은 CLAUDE.md 공식, 분 단위 반올림 규칙 주석 명시
4. adjustment_amount/adjustment_reason으로 admin 수동 조정, 최종 지급액 = 계산액 + adjustment_amount
5. 신규 정산은 status=pending, admin 확인 버튼으로 confirmed 전환
6. 정산 확정 후 해당 기간 세션 상태 변경 시 경고 표시

**검증**: 같은 멘토·기간 2회 실행 중복 확인, makeup 이중 정산 방지 실데이터 테스트.

## Phase 6 (선택) — Google Calendar 동기화

1. Calendar API 실패해도 tasks 저장은 성공 — 동기화는 별도 재시도 큐
2. tasks.google_event_id로 재동기화 시 update
3. 단방향(DB → Calendar) 명시

## 진행 팁

- 세션이 길어지면(30분+) 커밋 후 `/clear`로 새 세션 시작
- 새 시스템 가동 후에도 구글 캘린더 병행 운영 최소 1~2주, 값 대조 후 전환
