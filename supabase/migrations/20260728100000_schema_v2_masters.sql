-- =============================================================
-- Phase 6 — 스키마 v2: 마스터 테이블 도입 + 세션/배정 구조화
--
-- 배경: v1은 과목·세션종류·시간대를 전부 문자열로 들고 있었다.
--       캘린더 제목 파싱에 의존하던 운영 방식을 구조화된 필드로 옮긴다.
--
-- 이 마이그레이션이 하는 일:
--   1) 마스터: subjects / session_types / time_slots / rooms
--   2) 부속:   room_blocks / mentor_capabilities / session_series
--   3) 확장:   assignments(세션유형·상태·진도), sessions(시리즈·공간·진도)
--   4) 전환:   subject(text) → subject_id(FK)  ※ expand-and-contract 1단계
--   5) 소프트 삭제: tasks.deleted_at / sessions.deleted_at
--
-- 공통 규칙 (v1과 동일):
--   * 모든 PK는 uuid, gen_random_uuid() 기본값
--   * 모든 테이블에 created_at / updated_at (updated_at은 트리거 자동 갱신)
--   * 금액·시간 컬럼은 numeric(10,2)
--   * status류 컬럼은 CHECK 제약으로 허용값 강제
--   * 이력성 참조(sessions/tasks/settlements → student/mentor/마스터)는
--     ON DELETE RESTRICT, 순수 연결 테이블만 CASCADE
--
-- RLS: 이 마이그레이션에서 새 테이블의 RLS는 켜지 않는다.
--      (기존 v1 테이블의 RLS는 Phase 4에서 이미 켜져 있고 그대로 유지)
-- =============================================================


-- =============================================================
-- 1. 마스터 테이블
-- =============================================================

-- -------------------------------------------------------------
-- subjects: 과목 마스터
-- 색상·정렬순서를 데이터로 들고 있어야 화면에서 제목에 정렬용 숫자를
-- 붙이는 식의 편법이 필요 없어진다.
-- -------------------------------------------------------------
create table public.subjects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  display_order integer not null default 0,
  color         text not null default '#94a3b8'
                check (color ~ '^#[0-9a-fA-F]{6}$'),
  status        text not null default 'active'
                check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_subjects_display_order on public.subjects (display_order);

create trigger trg_subjects_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

comment on column public.subjects.color is
  '화면 표시용 색상(#RRGGBB). UI는 이 값을 그대로 사용한다.';
comment on column public.subjects.display_order is
  '화면 정렬 기준. 제목 문자열에 정렬용 숫자를 붙이지 않는다.';


-- -------------------------------------------------------------
-- session_types: 세션 종류 마스터 (공습 / 국어PT / 수학클리닉 …)
-- 세션 종류를 문자열로 저장하지 않기 위한 마스터.
--   * requires_subject: 과목이 의미 없는 유형(공부습관 등)은 false
--   * has_progress    : 진도(범위)를 관리하는 유형만 true
-- -------------------------------------------------------------
create table public.session_types (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  requires_subject boolean not null default true,
  has_progress     boolean not null default false,
  display_order    integer not null default 0,
  status           text not null default 'active'
                   check (status in ('active', 'inactive')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_session_types_updated_at
  before update on public.session_types
  for each row execute function public.set_updated_at();

comment on column public.session_types.code is
  '화면 제목 조립에 쓰는 짧은 코드(예: 공습, 국어PT). 제목은 저장하지 않고 이 코드로 계산한다.';
comment on column public.session_types.requires_subject is
  'false면 과목 무관 유형 — mentor_capabilities.subject_id를 비워둔다.';


-- -------------------------------------------------------------
-- time_slots: 시간대 라벨 마스터 (A / B …)
-- default_start_time/default_end_time은 어디까지나 "기본값"이고,
-- 실제 시각은 session_series가 자체 보유한다(수정 가능해야 하므로).
-- -------------------------------------------------------------
create table public.time_slots (
  id                 uuid primary key default gen_random_uuid(),
  label              text not null unique,
  default_start_time time not null,
  default_end_time   time not null,
  display_order      integer not null default 0,
  status             text not null default 'active'
                     check (status in ('active', 'inactive')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (default_end_time > default_start_time)
);

create trigger trg_time_slots_updated_at
  before update on public.time_slots
  for each row execute function public.set_updated_at();

comment on table public.time_slots is
  '시간대 라벨(A/B). 실제 세션 시각은 session_series.start_time/end_time이 정본이다.';


-- -------------------------------------------------------------
-- rooms: 공간 마스터
-- capacity: null이면 단독 사용(동시 1건만), 값이 있으면 그 인원까지 동시 사용 허용.
--           충돌 검사는 capacity 초과 시에만 차단한다.
-- -------------------------------------------------------------
create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  capacity      integer check (capacity is null or capacity > 0),
  display_order integer not null default 0,
  status        text not null default 'active'
                check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

comment on column public.rooms.capacity is
  'null = 단독 사용(동시 1건). 값이 있으면 동시 사용 정원 — 초과할 때만 충돌로 본다.';


-- =============================================================
-- 2. 부속 테이블
-- =============================================================

-- -------------------------------------------------------------
-- room_blocks: 공간 사용 불가 구간 (청소·행사·정기 점검 등)
-- 충돌 검사 시 세션과 동일하게 취급한다.
-- rooms의 순수 자식 → CASCADE
-- -------------------------------------------------------------
create table public.room_blocks (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  date       date not null,
  start_time time not null,
  end_time   time not null,
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index idx_room_blocks_room_id_date on public.room_blocks (room_id, date);

create trigger trg_room_blocks_updated_at
  before update on public.room_blocks
  for each row execute function public.set_updated_at();


-- -------------------------------------------------------------
-- mentor_capabilities: 멘토가 맡을 수 있는 (세션유형, 과목) 조합
-- mentors.subjects(text[])를 대체한다. 과목 무관 유형은 subject_id를 비운다.
--
-- unique는 nulls not distinct — 그렇지 않으면 subject_id가 null인 같은 조합이
-- 무한히 중복 등록된다(Postgres 기본은 NULL을 서로 다른 값으로 취급).
--
-- mentor 쪽은 순수 연결이므로 CASCADE, 마스터 참조는 RESTRICT.
-- -------------------------------------------------------------
create table public.mentor_capabilities (
  id              uuid primary key default gen_random_uuid(),
  mentor_id       uuid not null references public.mentors (id) on delete cascade,
  session_type_id uuid not null references public.session_types (id) on delete restrict,
  subject_id      uuid references public.subjects (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint mentor_capabilities_unique
    unique nulls not distinct (mentor_id, session_type_id, subject_id)
);

create index idx_mentor_capabilities_mentor_id on public.mentor_capabilities (mentor_id);
create index idx_mentor_capabilities_lookup
  on public.mentor_capabilities (session_type_id, subject_id);

create trigger trg_mentor_capabilities_updated_at
  before update on public.mentor_capabilities
  for each row execute function public.set_updated_at();

comment on table public.mentor_capabilities is
  '배정 화면에서 자격 있는 멘토를 필터링하는 기준. mentors.subjects(text[])를 대체한다.';


-- =============================================================
-- 3. assignments 확장 — 배정 후보 워크플로
-- =============================================================

alter table public.assignments
  add column session_type_id     uuid references public.session_types (id) on delete restrict,
  add column subject_id          uuid references public.subjects (id) on delete restrict,
  add column status              text not null default 'candidate'
                                 check (status in ('candidate', 'proposed', 'confirmed', 'ended')),
  add column memo                text,
  add column progress_unit_label text,
  add column progress_total      integer check (progress_total is null or progress_total > 0);

-- 같은 (학생, 세션유형, 과목) 조합에서 confirmed는 동시에 1건만.
-- nulls not distinct — 과목 무관 유형(subject_id null)도 중복 확정을 막아야 한다.
create unique index idx_assignments_single_confirmed
  on public.assignments (student_id, session_type_id, subject_id)
  nulls not distinct
  where (status = 'confirmed');

create index idx_assignments_status on public.assignments (status);
create index idx_assignments_candidate_aging
  on public.assignments (created_at)
  where (status = 'candidate');

comment on column public.assignments.status is
  'candidate(후보) → proposed(제안) → confirmed(확정) → ended(종료). 확정은 조합당 1건만.';
comment on column public.assignments.memo is
  '후보 검토 메모. 캘린더 메모로 관리하던 "국어PT 후보" 명단을 대체한다.';
comment on index public.idx_assignments_candidate_aging is
  'admin 대시보드의 "미확정 배정"(후보 상태로 방치된 배정) 목록 조회용.';


-- =============================================================
-- 4. session_series — 반복 세션 시리즈
-- =============================================================

-- day_of_week는 ISO-8601 기준 1=월 … 7=일 (Postgres의 isodow와 동일).
create table public.session_series (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments (id) on delete cascade,
  time_slot_id    uuid not null references public.time_slots (id) on delete restrict,
  room_id         uuid references public.rooms (id) on delete restrict,
  day_of_week     smallint not null check (day_of_week between 1 and 7),
  start_time      time not null,
  end_time        time not null,
  start_date      date not null,
  total_weeks     integer not null check (total_weeks > 0),
  status          text not null default 'active'
                  check (status in ('active', 'ended', 'canceled')),
  deleted_at      timestamptz,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_time > start_time)
);

create index idx_session_series_assignment_id on public.session_series (assignment_id);
create index idx_session_series_room_id on public.session_series (room_id);

create trigger trg_session_series_updated_at
  before update on public.session_series
  for each row execute function public.set_updated_at();

comment on column public.session_series.start_time is
  'time_slot의 default 시각으로 자동 채우되 수정 가능 — 실제 시각의 정본은 여기다.';
comment on column public.session_series.day_of_week is
  'ISO-8601: 1=월 … 7=일 (Postgres isodow와 동일).';


-- =============================================================
-- 5. sessions 확장 — 시리즈·공간·시간대·주차·진도 + scheduled 상태
-- =============================================================

alter table public.sessions
  add column series_id     uuid references public.session_series (id) on delete set null,
  add column room_id       uuid references public.rooms (id) on delete restrict,
  add column time_slot_id  uuid references public.time_slots (id) on delete restrict,
  add column week_number   integer check (week_number is null or week_number > 0),
  add column progress_from integer,
  add column progress_to   integer,
  add column deleted_at    timestamptz;

-- 시리즈가 지워져도 세션 이력은 남는다(SET NULL). 공간·시간대는 마스터라 RESTRICT.

alter table public.sessions
  add constraint sessions_progress_range check (
    progress_from is null
    or progress_to is null
    or progress_to >= progress_from
  );

-- status에 scheduled 추가. 기존 인라인 CHECK는 sessions_status_check로 자동 명명된다.
alter table public.sessions drop constraint if exists sessions_status_check;

alter table public.sessions
  add constraint sessions_status_check check (
    status in ('scheduled', 'completed', 'no_show', 'canceled', 'makeup')
  );

alter table public.sessions alter column status set default 'scheduled';

-- 시간 겹침(충돌) 조회용 인덱스.
-- mentor_id+date는 v1의 idx_sessions_mentor_id_date가 이미 있으므로 재생성하지 않는다.
create index idx_sessions_date_start_time on public.sessions (date, start_time);
create index idx_sessions_room_id_date on public.sessions (room_id, date);
create index idx_sessions_series_id on public.sessions (series_id);

comment on column public.sessions.deleted_at is
  '소프트 삭제. 조회는 항상 deleted_at is null 조건을 건다.';
comment on column public.sessions.week_number is
  '시리즈 내 회차(1부터). 제목의 "1주/4주" 표기는 이 값과 series.total_weeks로 계산한다.';


-- =============================================================
-- 6. tasks 소프트 삭제
-- =============================================================

alter table public.tasks add column deleted_at timestamptz;

comment on column public.tasks.deleted_at is
  '소프트 삭제. 조회는 항상 deleted_at is null 조건을 건다.';


-- =============================================================
-- 7. subject(text) → subject_id(FK) 전환 — expand-and-contract 1단계
--
-- 지금 앱 코드(admin/assignments, templates, lib/plan/generate 등)는 전부
-- subject 문자열로 읽고 쓴다. 여기서 컬럼을 바로 없애면 앱이 통째로 깨지므로:
--
--   [이 마이그레이션 = expand]
--     - subject_id 컬럼 추가 + 기존 문자열로부터 백필
--     - 레거시 subject 컬럼은 남기되 nullable로 완화하고 deprecated 표기
--     - 양방향 resolve 트리거로 둘을 항상 동기화
--       → 기존 코드(subject만 씀)도, 새 코드(subject_id만 씀)도 모두 동작
--
--   [후속 마이그레이션 = contract]
--     - 앱 코드가 전부 subject_id로 옮겨간 뒤 subject 컬럼 DROP
-- =============================================================

-- 7-1. 기존 문자열 과목을 마스터로 승격 (등장 순서와 무관하게 이름 기준 유일)
insert into public.subjects (name, display_order)
select distinct s.subject, 900
from (
  select subject from public.assignments where subject is not null
  union
  select subject from public.template_tasks where subject is not null
  union
  select subject from public.tasks where subject is not null
) as s
on conflict (name) do nothing;

-- 7-2. subject_id 컬럼 추가 (마스터 참조 → RESTRICT)
alter table public.tasks
  add column subject_id uuid references public.subjects (id) on delete restrict;
alter table public.template_tasks
  add column subject_id uuid references public.subjects (id) on delete restrict;
-- assignments.subject_id는 3번 섹션에서 이미 추가됨

create index idx_tasks_subject_id on public.tasks (subject_id);
create index idx_template_tasks_subject_id on public.template_tasks (subject_id);

-- 7-3. 백필
update public.tasks t
  set subject_id = s.id
  from public.subjects s
  where t.subject = s.name and t.subject_id is null;

update public.template_tasks tt
  set subject_id = s.id
  from public.subjects s
  where tt.subject = s.name and tt.subject_id is null;

update public.assignments a
  set subject_id = s.id
  from public.subjects s
  where a.subject = s.name and a.subject_id is null;

-- 7-4. 레거시 컬럼 NOT NULL 완화 (새 코드가 subject_id만 넣을 수 있도록)
alter table public.tasks alter column subject drop not null;
alter table public.template_tasks alter column subject drop not null;
alter table public.assignments alter column subject drop not null;

comment on column public.tasks.subject is
  'DEPRECATED — subject_id를 사용할 것. 앱 코드 전환 후 DROP 예정.';
comment on column public.template_tasks.subject is
  'DEPRECATED — subject_id를 사용할 것. 앱 코드 전환 후 DROP 예정.';
comment on column public.assignments.subject is
  'DEPRECATED — subject_id를 사용할 것. 앱 코드 전환 후 DROP 예정.';

-- 7-5. 양방향 동기화 트리거
--
-- 이름으로 마스터를 못 찾으면 새로 만든다. 기존 빠른입력(quickadd) 화면이
-- 임의 문자열("기타" 등)을 넣을 수 있어서, 막으면 그 경로가 죽는다.
-- 전환이 끝나면(subject 컬럼 DROP) 이 트리거도 함께 제거한다.
create or replace function public.resolve_subject_ref()
returns trigger
language plpgsql
as $$
declare
  v_id   uuid;
  v_name text;
begin
  if new.subject_id is null and new.subject is not null then
    select id into v_id from public.subjects where name = new.subject;
    if v_id is null then
      insert into public.subjects (name, display_order)
      values (new.subject, 900)
      on conflict (name) do update set name = excluded.name
      returning id into v_id;
    end if;
    new.subject_id := v_id;

  elsif new.subject is null and new.subject_id is not null then
    select name into v_name from public.subjects where id = new.subject_id;
    new.subject := v_name;
  end if;

  return new;
end;
$$;

comment on function public.resolve_subject_ref() is
  'subject(text) ↔ subject_id(FK) 전환기용 동기화 트리거. subject 컬럼 DROP 시 함께 제거.';

create trigger trg_tasks_resolve_subject
  before insert or update of subject, subject_id on public.tasks
  for each row execute function public.resolve_subject_ref();

create trigger trg_template_tasks_resolve_subject
  before insert or update of subject, subject_id on public.template_tasks
  for each row execute function public.resolve_subject_ref();

create trigger trg_assignments_resolve_subject
  before insert or update of subject, subject_id on public.assignments
  for each row execute function public.resolve_subject_ref();


-- =============================================================
-- 8. mentors.subjects 정리 예고
--
-- 담당 과목의 정본은 이제 mentor_capabilities다. 다만 지금 삭제하면
-- admin/mentors 화면과 parent_mentors_view가 즉시 깨지므로, 화면을
-- capabilities 기반으로 바꾼 뒤 후속 마이그레이션에서 DROP한다.
-- (세션유형 정보가 없어 text[] → capabilities 자동 백필은 불가능 —
--  어떤 session_type에 속하는 과목인지 알 수 없기 때문. 화면에서 재입력한다.)
-- =============================================================

comment on column public.mentors.subjects is
  'DEPRECATED — mentor_capabilities가 정본. 화면 전환 후 DROP 예정.';
