@AGENTS.md

# 프로젝트: 멘토링 학원 관리 시스템

## 스택

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + Row Level Security)

## 역할(Role) 3종

- **admin**: 전체 데이터 접근, 정산 확정/발송 권한
- **mentor**: 본인이 담당한 학생(assignments 기준)만 접근, 세션 완료/노쇼 체크 가능
- **parent**: 본인 자녀(students.parent_id 기준)의 학습 관련 정보만 read-only로 접근

## DB 스키마 (핵심 9개 테이블)

- **students**: id, name, school, grade, parent_id(FK → parents.id), status(active/inactive) — 하드 삭제 금지, status로만 관리
- **parents**: id, name, contact
- **mentors**: id, name, subjects(text[]), rate_type(hourly/per_session/flat), rate_amount(numeric), status(active/inactive) — 하드 삭제 금지
- **assignments**: id, student_id(FK), mentor_id(FK), subject, start_date, end_date(nullable)
- **study_plan_templates**: id, name(예: "이과_A_1주/4주"), duration_weeks
- **template_tasks**: id, template_id(FK), subject, item_type(daily_routine/sequential/conditional/one_time), config(jsonb, 유형별 세부설정 — "학습 항목 유형" 섹션 참고)
- **tasks**: id, student_id(FK), date, subject, content, status(planned/done), source_template_id(nullable), related_task_id(nullable, self-FK, ON DELETE SET NULL — 복습↔원본 학습, 조건부 액션↔트리거 연결용)
- **sessions**: id, student_id(FK), mentor_id(FK), date, start_time, end_time, status(completed/no_show/canceled/makeup), notes, related_session_id(nullable, 대체수업 연결용)
- **settlements**: id, mentor_id(FK), period_start, period_end, total_hours, total_sessions, amount(numeric), adjustment_amount(numeric, nullable), adjustment_reason(text, nullable), status(pending/confirmed/paid)
- **exceptions**: id, student_id(FK, nullable), start_date, end_date, reason, suppress_generation(boolean, default true) — 가족여행 등 개인 일정 기간엔 daily_routine·sequential 생성을 건너뜀

**공통 규칙**: 모든 PK는 UUID, 모든 테이블에 created_at·updated_at 포함. 금액·시간 관련 컬럼은 float 아닌 numeric(10,2). students/mentors를 참조하는 FK(sessions, tasks, settlements 등)는 ON DELETE RESTRICT로 이력 보호, assignments·template_tasks 같은 순수 연결 테이블만 ON DELETE CASCADE.

## 학습 항목 유형 (template_tasks.item_type별 config)

실제 학습 계획에는 성격이 다른 4가지 항목이 섞여 있음. item_type으로 구분하고 config(jsonb)에 유형별 설정을 담는다. (아래 수치는 예시이며 실제 값은 운영하면서 확정)

- **daily_routine**: 배정 기간 내내 매일 동일 내용 반복. 예: "국어 강기본 하루 2강씩". config: `{instruction, days}`
- **sequential**: 범위가 주기마다 전진, 학습 후 일정 기간 뒤 같은 범위의 복습 과제가 자동 생성됨. 예: "단어 Day 25-27 암기"→며칠 뒤 "복습". config: `{unit_label, start_unit, units_per_period, period_days, review_lag_days, total_units}`
- **conditional**: 다른 행동(트리거)이 확인돼야 액션 과제가 생성됨. 예: "마플 문제집 풀이는 강의 본 날". config: `{trigger, action}`
- **one_time**: 특정 주차·요일의 1회성 항목. config: `{week_number, day_of_week, content}`

## 화면 표시 규칙

"공부습관GPT_화A_1주/4주_임태호M_주보경" 같은 제목은 문자열로 저장하지 않고, 항상 구조화된 필드(과목·주차·멘토·학생 등)로부터 계산해서 생성한다. 수기 제목 입력 필드를 만들지 않는다.

## 멀티테넌시 대비 (지금 당장 쓰지 않아도 필드만 미리 넣기)

핵심 테이블(students, mentors, parents, assignments, sessions, settlements)에 organization_id 컬럼을 추가해둔다. 지금은 값이 항상 같은 고정 UUID 하나뿐이라 로직에 영향 없지만, 나중에 여러 학원을 지원하게 될 때 이 컬럼이 없으면 전체 테이블 마이그레이션이 필요해진다.

## 정산 규칙 (중요 — 실제 정책 확정되면 이 섹션부터 고칠 것)

Claude Code는 세션마다 이 파일을 다시 읽습니다. 아래는 개발용 초기값이니, 실제 정책이 정해지면 여기를 바로 수정하세요.

- 노쇼(학생 귀책) 정산 포함 여부: **TBD** — 우선 기본값 "포함"으로 개발
- 멘토 귀책 결석/대체수업 처리: 대체수업은 sessions.related_session_id로 원 세션과 연결. 정산은 실제 진행된(makeup) 세션 기준으로 계산, 원 세션과 중복 정산 금지
- 부분 진행 세션: **TBD** — 우선 실제 진행 시간(start_time~end_time) 기준으로 시간 계산
- rate_type별 계산: hourly = 진행시간 × rate_amount / per_session = 완료 세션수 × rate_amount / flat = 기간 내 고정액(세션 수와 무관)

## 학부모(parent) 뷰 제한사항 — RLS로 강제할 것

- parent role은 sessions.notes, mentors.rate_amount, mentors.rate_type, settlements 테이블에 어떤 방식으로도 접근 불가
- parent role은 본인 자녀 외 다른 student의 데이터에 접근 불가
- parent 화면 노출 범위: 이번 주 tasks(계획/완료여부), 담당 mentor 이름, 다음 시험일정 정도로 제한

## 코딩 컨벤션

- 기능 단위로 작게 커밋, 각 Phase 완료 시 커밋
- RLS 정책 작성 후에는 반드시 실제 다른 계정으로 로그인해서 데이터 격리를 눈으로 확인하고 다음 단계로 진행

## 마이그레이션 · 롤아웃 전략

- 지금 구글 캘린더는 실제로 운영 중인 시스템. 새 시스템을 다 만들고 나서 한 번에 전환하지 말고, 최소 1~2주는 두 시스템을 병행 운영하며 값이 일치하는지 대조할 것.
- 기존 학생·멘토 기초정보(이름, 학교, 담당관계 등)는 자동 마이그레이션 스크립트를 짜지 말고 새 시스템의 admin 화면에서 직접 재입력 권장 — 몇 십 명 규모면 반나절이면 끝나고, 캘린더 이벤트 제목을 파싱하는 것보다 훨씬 안전함.
- 과거에 진행된 학습 콘텐츠·세션 이력은 옮기지 않고, 새 시스템을 실제로 쓰기 시작하는 시점부터의 데이터만 새로 쌓는다.

## 진행 순서

Phase별 구현·검증 프롬프트는 [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) 참고. 각 Phase는 구현 → 검증 → 커밋 순서로 진행하고, 검증을 건너뛰지 않는다.
