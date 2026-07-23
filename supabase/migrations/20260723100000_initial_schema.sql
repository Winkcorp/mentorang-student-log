-- =============================================================
-- 멘토링 학원 관리 시스템 — 초기 스키마 (Phase 1)
-- CLAUDE.md 스키마 정의 기준. RLS는 이 마이그레이션에서 켜지 않는다 (Phase 4).
--
-- 공통 규칙:
--  * 모든 PK는 uuid, gen_random_uuid() 기본값
--  * 모든 테이블에 created_at / updated_at (updated_at은 트리거로 자동 갱신)
--  * 금액·시간 컬럼은 numeric(10,2) (float 금지)
--  * status류 컬럼은 CHECK 제약으로 허용값 강제
--  * students/mentors를 참조하는 이력성 FK(sessions, tasks, settlements 등)는
--    ON DELETE RESTRICT — 순수 연결 테이블(assignments, template_tasks)만 CASCADE
--  * 멀티테넌시 대비: 핵심 테이블에 organization_id (지금은 고정 UUID 하나)
-- =============================================================

-- 고정 organization UUID (단일 학원 운영 단계).
-- 나중에 멀티테넌시 도입 시 organizations 테이블을 만들고 FK를 추가한다.
-- 고정값: 00000000-0000-0000-0000-000000000001

-- -------------------------------------------------------------
-- updated_at 자동 갱신 트리거 함수
-- -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------
-- parents: 학부모
-- -------------------------------------------------------------
create table public.parents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  contact         text,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_parents_updated_at
  before update on public.parents
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- students: 학생 — 하드 삭제 금지, status로만 관리
-- -------------------------------------------------------------
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  school          text,
  grade           text,
  parent_id       uuid references public.parents (id) on delete restrict,
  status          text not null default 'active'
                  check (status in ('active', 'inactive')),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_students_parent_id on public.students (parent_id);

create trigger trg_students_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- mentors: 멘토 — 하드 삭제 금지, status로만 관리
-- -------------------------------------------------------------
create table public.mentors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  subjects        text[] not null default '{}',
  rate_type       text not null
                  check (rate_type in ('hourly', 'per_session', 'flat')),
  rate_amount     numeric(10,2) not null default 0,
  status          text not null default 'active'
                  check (status in ('active', 'inactive')),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_mentors_updated_at
  before update on public.mentors
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- assignments: 학생↔멘토 담당 관계 (순수 연결 테이블 → CASCADE)
-- -------------------------------------------------------------
create table public.assignments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  mentor_id       uuid not null references public.mentors (id) on delete cascade,
  subject         text not null,
  start_date      date not null,
  end_date        date,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index idx_assignments_student_id on public.assignments (student_id);
create index idx_assignments_mentor_id on public.assignments (mentor_id);

create trigger trg_assignments_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- study_plan_templates: 학습 계획 템플릿
-- 제목 표시는 구조화된 필드로부터 계산 — 수기 제목 필드를 여기 외에 추가하지 않는다
-- -------------------------------------------------------------
create table public.study_plan_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  duration_weeks integer not null check (duration_weeks > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_study_plan_templates_updated_at
  before update on public.study_plan_templates
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- template_tasks: 템플릿 내 학습 항목 (순수 연결/구성 테이블 → CASCADE)
-- item_type별 config(jsonb) 구조는 CLAUDE.md "학습 항목 유형" 참고
-- -------------------------------------------------------------
create table public.template_tasks (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.study_plan_templates (id) on delete cascade,
  subject     text not null,
  item_type   text not null
              check (item_type in ('daily_routine', 'sequential', 'conditional', 'one_time')),
  config      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- item_type별 config 필수 키 강제 (유형과 안 맞는 config 차단)
  constraint template_tasks_config_shape check (
    (item_type = 'daily_routine' and config ? 'instruction')
    or (item_type = 'sequential' and config ?& array[
      'unit_label', 'start_unit', 'units_per_period', 'period_days', 'review_lag_days'
    ])
    or (item_type = 'conditional' and config ?& array['trigger', 'action'])
    or (item_type = 'one_time' and config ?& array['week_number', 'day_of_week', 'content'])
  )
);

create index idx_template_tasks_template_id on public.template_tasks (template_id);

create trigger trg_template_tasks_updated_at
  before update on public.template_tasks
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- tasks: 학생별 일일 학습 과제 (이력 → RESTRICT)
-- related_task_id: 복습↔원본 학습, 조건부 액션↔트리거 연결용
-- -------------------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students (id) on delete restrict,
  date               date not null,
  subject            text not null,
  content            text not null,
  status             text not null default 'planned'
                     check (status in ('planned', 'done')),
  source_template_id uuid references public.study_plan_templates (id) on delete set null,
  related_task_id    uuid references public.tasks (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_tasks_student_id_date on public.tasks (student_id, date);
create index idx_tasks_related_task_id on public.tasks (related_task_id);
create index idx_tasks_source_template_id on public.tasks (source_template_id);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- sessions: 멘토링 세션 (이력 → RESTRICT)
-- related_session_id: 대체수업(makeup) ↔ 원 세션 연결용
-- -------------------------------------------------------------
create table public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students (id) on delete restrict,
  mentor_id          uuid not null references public.mentors (id) on delete restrict,
  date               date not null,
  start_time         time not null,
  end_time           time not null,
  status             text not null
                     check (status in ('completed', 'no_show', 'canceled', 'makeup')),
  notes              text,
  related_session_id uuid references public.sessions (id) on delete set null,
  organization_id    uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_time > start_time)
);

create index idx_sessions_student_id_date on public.sessions (student_id, date);
create index idx_sessions_mentor_id_date on public.sessions (mentor_id, date);
create index idx_sessions_related_session_id on public.sessions (related_session_id);

create trigger trg_sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- settlements: 멘토별 정산 (이력 → RESTRICT)
-- 같은 mentor+period 조합은 유일 — 정산 재실행 시 업데이트(멱등성, Phase 5)
-- -------------------------------------------------------------
create table public.settlements (
  id                uuid primary key default gen_random_uuid(),
  mentor_id         uuid not null references public.mentors (id) on delete restrict,
  period_start      date not null,
  period_end        date not null,
  total_hours       numeric(10,2) not null default 0,
  total_sessions    integer not null default 0,
  amount            numeric(10,2) not null default 0,
  adjustment_amount numeric(10,2),
  adjustment_reason text,
  status            text not null default 'pending'
                    check (status in ('pending', 'confirmed', 'paid')),
  organization_id   uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (period_end >= period_start),
  constraint settlements_mentor_period_unique unique (mentor_id, period_start, period_end)
);

create index idx_settlements_mentor_id on public.settlements (mentor_id);

create trigger trg_settlements_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- exceptions: 개인 일정 예외 기간 (가족여행 등)
-- student_id null이면 전체(학원 단위) 예외.
-- suppress_generation=true인 기간엔 daily_routine·sequential 생성을 건너뜀
-- -------------------------------------------------------------
create table public.exceptions (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid references public.students (id) on delete restrict,
  start_date          date not null,
  end_date            date not null,
  reason              text,
  suppress_generation boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_date >= start_date)
);

create index idx_exceptions_student_id on public.exceptions (student_id);
create index idx_exceptions_dates on public.exceptions (start_date, end_date);

create trigger trg_exceptions_updated_at
  before update on public.exceptions
  for each row execute function public.set_updated_at();
