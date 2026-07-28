@AGENTS.md

# 프로젝트: 멘토링 학원 관리 시스템

## 스택

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + Row Level Security)

## 역할(Role) 3종

- **admin**: 전체 데이터 접근, 정산 확정/발송 권한
- **mentor**: 본인이 담당한 학생(assignments 기준)만 접근, 세션 완료/노쇼 체크 가능
- **parent**: 본인 자녀(students.parent_id 기준)의 학습 관련 정보만 read-only로 접근

## DB 스키마

### 마스터 테이블 — 과목·세션종류·시간대·공간은 문자열로 저장하지 않는다

- **subjects**: id, name, display_order, color(#RRGGBB), status(active/inactive) — 화면 정렬은 display_order, 색상은 color를 그대로 사용. 제목에 정렬용 숫자를 붙이지 않는다
- **session_types**: id, code(예: 공습, 국어PT), name, requires_subject(bool — false면 과목 무관 유형), has_progress(bool — 진도 관리 여부), display_order, status
- **time_slots**: id, label(A/B), default_start_time, default_end_time, display_order, status — default 시각은 어디까지나 기본값이고, **실제 시각의 정본은 session_series.start_time/end_time**
- **rooms**: id, name, capacity(nullable — null이면 단독 사용, 값이 있으면 그 인원까지 동시 사용 허용), display_order, status

### 운영 테이블

- **students**: id, name, school, grade, parent_id(FK → parents.id), status(active/inactive) — 하드 삭제 금지, status로만 관리
- **parents**: id, name, contact
- **mentors**: id, name, rate_type(hourly/per_session/flat), rate_amount(numeric), status(active/inactive) — 하드 삭제 금지. 담당 과목은 text[]가 아니라 mentor_capabilities가 정본
- **mentor_capabilities**: id, mentor_id(FK), session_type_id(FK), subject_id(FK, nullable — 과목 무관 유형은 비움) — 배정 화면에서 자격 있는 멘토를 필터링하는 기준. (mentor, session_type, subject) 유일(NULLS NOT DISTINCT)
- **assignments**: id, student_id(FK), mentor_id(FK), session_type_id(FK), subject_id(FK, nullable), status(candidate/proposed/confirmed/ended), memo, start_date, end_date(nullable), progress_unit_label, progress_total — 같은 (student, session_type, subject) 조합에서 **confirmed는 동시에 1건만**(partial unique index)
- **session_series**: id, assignment_id(FK), time_slot_id(FK), room_id(FK, nullable), day_of_week(ISO 1=월…7=일), start_time, end_time, start_date, total_weeks, status(active/ended/canceled), deleted_at
- **room_blocks**: id, room_id(FK), date, start_time, end_time, reason — 공간 사용 불가 구간. 충돌 검사에서 세션과 동일하게 취급
- **study_plan_templates**: id, name(예: "이과_A_1주/4주"), duration_weeks
- **template_tasks**: id, template_id(FK), subject_id(FK), item_type(daily_routine/sequential/conditional/one_time), config(jsonb, 유형별 세부설정 — "학습 항목 유형" 섹션 참고)
- **tasks**: id, student_id(FK), date, subject_id(FK), content, status(planned/done), source_template_id(nullable), source_template_task_id(nullable), related_task_id(nullable, self-FK, ON DELETE SET NULL — 복습↔원본 학습, 조건부 액션↔트리거 연결용), deleted_at
- **sessions**: id, student_id(FK), mentor_id(FK), series_id(FK, nullable), room_id(FK, nullable), time_slot_id(FK, nullable), date, start_time, end_time, week_number, progress_from, progress_to, status(scheduled/completed/no_show/canceled/makeup), notes, related_session_id(nullable, 대체수업 연결용), deleted_at
- **settlements**: id, mentor_id(FK), period_start, period_end, total_hours, total_sessions, amount(numeric), adjustment_amount(numeric, nullable), adjustment_reason(text, nullable), status(pending/confirmed/paid)
- **exceptions**: id, student_id(FK, nullable), start_date, end_date, reason, suppress_generation(boolean, default true) — 가족여행 등 개인 일정 기간엔 daily_routine·sequential 생성을 건너뜀
- **attendance_overrides**: id, student_id(FK), date, status(present/partial/absent), reason — **그날 세션이 아예 없는 경우에만** 쓰는 수동 출결. (student, date) 유일. 세션이 있는 날은 DB 트리거가 입력을 거부한다

**공통 규칙**: 모든 PK는 UUID(gen_random_uuid()), 모든 테이블에 created_at·updated_at 포함(updated_at은 트리거 자동 갱신). 금액·시간 관련 컬럼은 float 아닌 numeric(10,2). status류 컬럼은 전부 CHECK 제약으로 허용값 강제. students/mentors를 참조하는 FK(sessions, tasks, settlements 등)는 ON DELETE RESTRICT로 이력 보호, assignments·template_tasks·mentor_capabilities 같은 순수 연결 테이블만 ON DELETE CASCADE. tasks·sessions·session_series 삭제는 하드 삭제가 아니라 deleted_at(소프트 삭제) — 조회 시 항상 `deleted_at is null` 조건을 건다.

**전환 중인 컬럼**: `tasks.subject` / `template_tasks.subject` / `assignments.subject`(text)와 `mentors.subjects`(text[])는 DEPRECATED다. 마이그레이션 `20260728100000_schema_v2_masters.sql`이 subject_id를 추가하고 양방향 동기화 트리거(`resolve_subject_ref`)를 걸어둬서 구코드도 아직 동작한다. 앱 코드를 subject_id로 옮긴 뒤 후속 마이그레이션에서 텍스트 컬럼과 트리거를 DROP한다. **새 코드는 subject_id만 쓸 것.**

## 학습 항목 유형 (template_tasks.item_type별 config)

실제 학습 계획에는 성격이 다른 4가지 항목이 섞여 있음. item_type으로 구분하고 config(jsonb)에 유형별 설정을 담는다. (아래 수치는 예시이며 실제 값은 운영하면서 확정)

- **daily_routine**: 배정 기간 내내 매일 동일 내용 반복. 예: "국어 강기본 하루 2강씩". config: `{instruction, days}`
- **sequential**: 범위가 주기마다 전진, 학습 후 일정 기간 뒤 같은 범위의 복습 과제가 자동 생성됨. 예: "단어 Day 25-27 암기"→며칠 뒤 "복습". config: `{unit_label, start_unit, units_per_period, period_days, review_lag_days, total_units}`
- **conditional**: 다른 행동(트리거)이 확인돼야 액션 과제가 생성됨. 예: "마플 문제집 풀이는 강의 본 날". config: `{trigger, action}`
- **one_time**: 특정 주차·요일의 1회성 항목. config: `{week_number, day_of_week, content}`

## 화면 표시 규칙

"공부습관GPT_화A_1주/4주_임태호M_주보경" 같은 제목은 문자열로 저장하지 않고, 항상 구조화된 필드(과목·주차·멘토·학생 등)로부터 계산해서 생성한다. 수기 제목 입력 필드를 만들지 않는다.

세션 제목 조립 순서: `{session_type.code}_{요일}{time_slot.label}_{week_number}주/{series.total_weeks}주_{멘토명}M_{학생명}`. `session_types.has_progress = true`인 유형은 `progress_from~progress_to/progress_total`도 함께 계산해 표시한다.

## 배정 후보 워크플로

캘린더 메모로 관리하던 "국어PT 후보", "공습 후보" 명단을 assignments로 구조화한 것.

- 후보 목록은 **mentor_capabilities로 필터링** — 학생 + 세션유형(+과목)을 고르면 자격 있는 멘토만 나온다. 각 후보 옆에 그 멘토의 현재 담당 학생 수와 요일별 기존 세션 수를 함께 보여줘 과부하를 판단할 수 있게 한다
- 한 조합에 `status=candidate`로 여러 명을 등록할 수 있고, `memo`에 검토 메모를 남긴다
- 한 명을 `confirmed`로 전환하면 같은 (학생, 세션유형, 과목) 조합의 나머지 candidate는 자동으로 `ended` 처리한다
- confirmed 중복은 DB partial unique index로 막힌다. **DB 에러를 그대로 노출하지 말고** "이미 확정된 배정이 있습니다" 안내 + 기존 배정을 보여주고 교체할지 묻는다
- candidate로 7일 이상 방치된 배정은 admin 대시보드에 "미확정 배정" 목록으로 띄운다

## 세션 생성 규칙

- 세션은 개별 생성이 아니라 **session_series 단위로 일괄 생성**한다. 시리즈 생성은 `status=confirmed`인 배정에만 허용
- 시간대를 고르면 `time_slots`의 default 시각이 자동으로 채워지되 수정 가능해야 한다 (실제 시각의 정본은 series)
- exceptions와 겹치는 날짜는 건너뛰고, **몇 개 생성 / 몇 개 건너뜀**을 결과로 보여준다
- 시리즈 수정·삭제는 항상 **"이 회차만 / 이 회차 이후 전체 / 전체 시리즈" 3택**. 이미 `completed`·`no_show`로 확정된 과거 세션은 **어떤 선택에서도 변경되지 않는다**
- 삭제는 하드 삭제가 아니라 `deleted_at`
- 진도 관리 유형은 직전 회차의 `progress_to`를 다음 회차 `progress_from`의 기본값으로 제안한다

## 충돌 감지 규칙

세션 저장 **전에** 공간·멘토·학생 3종을 검사하고, "3주차 화요일 16:30 — 공습룸이 이미 예약됨" 형태의 충돌 목록을 보여준 뒤 사용자가 확인해야만 저장한다.

- **멘토 충돌 / 학생 충돌**: 같은 시간대에 1건이라도 겹치면 충돌
- **공간 충돌**: `rooms.capacity`가 null이면 1건만 허용(단독 사용), 값이 있으면 **정원을 초과할 때만** 충돌 — 여러 학생이 동시에 쓰는 공간을 고려
- `room_blocks`와 겹치는 시간도 공간 충돌로 취급
- 검사 대상에서 `deleted_at is not null`과 `status='canceled'`인 세션은 제외

## 출결 처리 규칙

- 출결은 **별도 기록 테이블·화면을 만들지 않고 `sessions.status`에서 파생**한다 (출석=completed/makeup, 결석=no_show, 부분출석=그날 세션 중 일부만 completed)
- `canceled`·`scheduled` 세션은 판정에서 제외한다 (학생 귀책이 아니거나 아직 일어나지 않았으므로)
- admin 화면(`/admin/attendance`)에 학생별 일 단위 출결 요약과 월간 출결 표를 제공한다
- 수동 출결 입력은 **그날 세션이 아예 없는 날에 한해서만** 허용. 세션이 있는 날은 수동 입력 필드를 노출하지 않고, DB 트리거로도 막는다. 판정은 항상 세션 파생값이 수동 입력을 이긴다
- 파생 로직은 `lib/attendance/derive.ts`의 순수 함수 — 화면에서 다시 구현하지 말 것

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
