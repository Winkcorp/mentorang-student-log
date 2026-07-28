-- =============================================================
-- Phase 6.2 — 수동 출결 입력 (예외 경로)
--
-- 출결은 sessions.status에서 파생하는 것이 원칙이다(CLAUDE.md "출결 처리 규칙").
-- 다만 "그날 세션이 아예 없는 날"은 파생할 원본이 없어서 저장할 곳이 필요하다.
-- 이 테이블은 딱 그 경우에만 쓰이고, 세션이 있는 날은 트리거가 막는다.
--
-- 화면에서도 세션이 있는 날엔 입력 필드를 노출하지 않지만, DB에서도 한 번 더
-- 막아 두 경로가 어긋나지 않게 한다.
-- =============================================================

create table public.attendance_overrides (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  date       date not null,
  status     text not null check (status in ('present', 'partial', 'absent')),
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_overrides_student_date_unique unique (student_id, date)
);

create index idx_attendance_overrides_student_date
  on public.attendance_overrides (student_id, date);

create trigger trg_attendance_overrides_updated_at
  before update on public.attendance_overrides
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- 세션이 있는 날에는 수동 출결을 남길 수 없다.
-- (취소·소프트삭제된 세션은 "없는 것"으로 본다 — 출결 파생에서도 제외되므로)
-- -------------------------------------------------------------
create or replace function public.reject_override_when_session_exists()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.sessions s
    where s.student_id = new.student_id
      and s.date = new.date
      and s.deleted_at is null
      and s.status <> 'canceled'
  ) then
    raise exception
      '그날(%)은 세션이 있어 출결을 수동 입력할 수 없습니다. 세션 상태로 관리하세요.',
      new.date;
  end if;

  return new;
end;
$$;

create trigger trg_attendance_overrides_no_session
  before insert or update on public.attendance_overrides
  for each row execute function public.reject_override_when_session_exists();

comment on table public.attendance_overrides is
  '세션이 없는 날의 수동 출결. 세션이 있는 날은 sessions.status에서 파생하며 트리거가 입력을 막는다.';
