-- =============================================================
-- Phase 6.5 — 스키마 v2 신규 테이블 RLS
--
-- Phase 6에서는 "RLS를 아직 켜지 말 것" 지시에 따라 신규 테이블을 열어뒀다.
-- 그 결과 기존 v1 테이블은 RLS가 켜져 있고 신규 테이블만 꺼진 혼재 상태였다.
-- 여기서 정리한다.
--
-- 원칙은 Phase 4와 동일:
--   * 역할별 정책을 명시적으로 분리 (permissive = OR 결합이라 parent 정책이
--     admin/mentor 접근을 막지 않는다)
--   * admin: 전체
--   * mentor: 본인 담당 범위만
--   * parent: 학습에 필요한 마스터(과목 등)만 읽기. 운영 정보(공간·시리즈·
--     자격·출결)는 접근 불가 — 학부모 노출 범위를 넓히지 않는다
--   * role=null(승인 대기): 전부 차단
-- =============================================================

-- -------------------------------------------------------------
-- 접근 판정 헬퍼
-- -------------------------------------------------------------

-- 승인된 역할을 가진 사용자인가 (승인 대기 계정을 걸러낸다)
create or replace function public.has_role()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.get_my_role() is not null;
$$;

-- 이 시리즈가 내가 담당한 배정의 것인가
create or replace function public.is_my_series(p_series_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.session_series ss
    join public.assignments a on a.id = ss.assignment_id
    where ss.id = p_series_id
      and a.mentor_id = public.my_mentor_id()
  );
$$;

-- -------------------------------------------------------------
-- RLS 활성화
-- -------------------------------------------------------------
alter table public.subjects             enable row level security;
alter table public.session_types        enable row level security;
alter table public.time_slots           enable row level security;
alter table public.rooms                enable row level security;
alter table public.room_blocks          enable row level security;
alter table public.mentor_capabilities  enable row level security;
alter table public.session_series       enable row level security;
alter table public.attendance_overrides enable row level security;

-- -------------------------------------------------------------
-- 마스터 4종 — admin이 관리, 승인된 역할은 읽기만
-- (화면이 과목명·색상·유형명·시간대 라벨을 표시하려면 읽기가 필요하다)
-- -------------------------------------------------------------
create policy "subjects_admin_all" on public.subjects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "subjects_read" on public.subjects
  for select to authenticated using (public.has_role());

create policy "session_types_admin_all" on public.session_types
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "session_types_read" on public.session_types
  for select to authenticated using (public.has_role());

create policy "time_slots_admin_all" on public.time_slots
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "time_slots_read" on public.time_slots
  for select to authenticated using (public.has_role());

create policy "rooms_admin_all" on public.rooms
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "rooms_read" on public.rooms
  for select to authenticated using (public.has_role());

-- -------------------------------------------------------------
-- room_blocks — admin 관리, mentor는 충돌 확인을 위해 읽기.
-- parent 정책 없음 = 접근 불가
-- -------------------------------------------------------------
create policy "room_blocks_admin_all" on public.room_blocks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "room_blocks_mentor_read" on public.room_blocks
  for select to authenticated
  using (public.get_my_role() = 'mentor');

-- -------------------------------------------------------------
-- mentor_capabilities — admin 관리, mentor는 본인 자격만 읽기.
-- parent 정책 없음 (누가 어떤 과목을 맡는지는 학부모 범위 밖)
-- -------------------------------------------------------------
create policy "mentor_capabilities_admin_all" on public.mentor_capabilities
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "mentor_capabilities_mentor_read" on public.mentor_capabilities
  for select to authenticated
  using (mentor_id = public.my_mentor_id());

-- -------------------------------------------------------------
-- session_series — admin 관리, mentor는 본인 담당 배정의 시리즈만 읽기.
-- parent는 세션 정보를 parent_sessions_view로만 본다 → 정책 없음
-- -------------------------------------------------------------
create policy "session_series_admin_all" on public.session_series
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "session_series_mentor_read" on public.session_series
  for select to authenticated
  using (public.is_my_series(id));

-- -------------------------------------------------------------
-- attendance_overrides — admin 관리, mentor는 담당 학생 것만 읽기.
-- parent 정책 없음 (출결은 학부모 노출 범위에 없다)
-- -------------------------------------------------------------
create policy "attendance_overrides_admin_all" on public.attendance_overrides
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "attendance_overrides_mentor_read" on public.attendance_overrides
  for select to authenticated
  using (public.is_assigned_mentor(student_id));


-- =============================================================
-- 전환용 subject 동기화 트리거를 SECURITY DEFINER로
--
-- subjects에 RLS가 걸리면서, 멘토가 과제를 쓸 때 이 트리거가 subjects에
-- INSERT를 시도하다 정책에 막힐 수 있다. 트리거는 데이터 정합성을 맞추는
-- 내부 장치이므로 호출자 권한과 무관하게 동작해야 한다.
--
-- subject 텍스트 컬럼을 DROP하는 contract 단계에서 이 함수도 함께 제거된다.
-- =============================================================

create or replace function public.resolve_subject_ref()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_name text;
begin
  if tg_op = 'UPDATE' then
    if new.subject_id is null and old.subject_id is not null then
      new.subject := null;
      return new;
    end if;

    if new.subject is null and old.subject is not null
       and new.subject_id is not distinct from old.subject_id then
      new.subject_id := null;
      return new;
    end if;
  end if;

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
