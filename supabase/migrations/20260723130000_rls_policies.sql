-- =============================================================
-- Phase 4 — 전체 테이블 RLS 정책
--
-- 원칙:
--  * 역할별 정책을 명시적으로 분리 (permissive = OR 결합이므로
--    parent 정책이 admin/mentor 접근을 막지 않는다)
--  * admin: 전체 접근
--  * mentor: 본인 담당(assignments 기준) 학생 데이터만
--  * parent: 본인 자녀(students.parent_id 기준)만 read-only
--  * parent는 sessions.notes / mentors.rate_amount·rate_type /
--    settlements에 어떤 경로로도 접근 불가
--    - sessions: notes를 제외한 parent_sessions_view로만 조회
--    - mentors: 이름·과목만 노출하는 mentors_public_view 사용
-- =============================================================

-- -------------------------------------------------------------
-- 접근 판정 헬퍼 (security definer — RLS 안에서 재귀 없이 사용)
-- -------------------------------------------------------------
create or replace function public.is_assigned_mentor(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.assignments a
    where a.student_id = p_student_id
      and a.mentor_id = public.my_mentor_id()
  );
$$;

create or replace function public.is_my_child(p_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.parent_id = public.my_parent_id()
  );
$$;

-- -------------------------------------------------------------
-- RLS 활성화
-- -------------------------------------------------------------
alter table public.parents enable row level security;
alter table public.students enable row level security;
alter table public.mentors enable row level security;
alter table public.assignments enable row level security;
alter table public.study_plan_templates enable row level security;
alter table public.template_tasks enable row level security;
alter table public.tasks enable row level security;
alter table public.sessions enable row level security;
alter table public.settlements enable row level security;
alter table public.exceptions enable row level security;

-- -------------------------------------------------------------
-- parents
-- -------------------------------------------------------------
create policy "parents_admin_all" on public.parents
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "parents_parent_select_own" on public.parents
  for select to authenticated
  using (id = public.my_parent_id());

-- -------------------------------------------------------------
-- students
-- -------------------------------------------------------------
create policy "students_admin_all" on public.students
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "students_mentor_select_assigned" on public.students
  for select to authenticated
  using (public.is_assigned_mentor(id));

create policy "students_parent_select_children" on public.students
  for select to authenticated
  using (parent_id = public.my_parent_id());

-- -------------------------------------------------------------
-- mentors — parent는 직접 접근 불가 (rate 정보 보호).
-- 이름·과목은 mentors_public_view로만 노출.
-- -------------------------------------------------------------
create policy "mentors_admin_all" on public.mentors
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "mentors_mentor_select_own" on public.mentors
  for select to authenticated
  using (id = public.my_mentor_id());

-- -------------------------------------------------------------
-- assignments
-- -------------------------------------------------------------
create policy "assignments_admin_all" on public.assignments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "assignments_mentor_select_own" on public.assignments
  for select to authenticated
  using (mentor_id = public.my_mentor_id());

create policy "assignments_parent_select_children" on public.assignments
  for select to authenticated
  using (public.is_my_child(student_id));

-- -------------------------------------------------------------
-- study_plan_templates / template_tasks — admin 관리, mentor 열람
-- -------------------------------------------------------------
create policy "templates_admin_all" on public.study_plan_templates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "templates_mentor_select" on public.study_plan_templates
  for select to authenticated
  using (public.get_my_role() = 'mentor');

create policy "template_tasks_admin_all" on public.template_tasks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "template_tasks_mentor_select" on public.template_tasks
  for select to authenticated
  using (public.get_my_role() = 'mentor');

-- -------------------------------------------------------------
-- tasks — mentor는 담당 학생 읽기/쓰기(체크·반응형 생성·파생 정리),
-- parent는 자녀 것 읽기 전용
-- -------------------------------------------------------------
create policy "tasks_admin_all" on public.tasks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "tasks_mentor_select_assigned" on public.tasks
  for select to authenticated
  using (public.is_assigned_mentor(student_id));

create policy "tasks_mentor_insert_assigned" on public.tasks
  for insert to authenticated
  with check (public.is_assigned_mentor(student_id));

create policy "tasks_mentor_update_assigned" on public.tasks
  for update to authenticated
  using (public.is_assigned_mentor(student_id))
  with check (public.is_assigned_mentor(student_id));

create policy "tasks_mentor_delete_assigned" on public.tasks
  for delete to authenticated
  using (public.is_assigned_mentor(student_id));

create policy "tasks_parent_select_children" on public.tasks
  for select to authenticated
  using (public.is_my_child(student_id));

-- -------------------------------------------------------------
-- sessions — parent 정책 없음 (notes 노출 방지, 뷰로만 접근)
-- -------------------------------------------------------------
create policy "sessions_admin_all" on public.sessions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "sessions_mentor_select_own" on public.sessions
  for select to authenticated
  using (mentor_id = public.my_mentor_id());

create policy "sessions_mentor_insert_own" on public.sessions
  for insert to authenticated
  with check (mentor_id = public.my_mentor_id());

create policy "sessions_mentor_update_own" on public.sessions
  for update to authenticated
  using (mentor_id = public.my_mentor_id())
  with check (mentor_id = public.my_mentor_id());

-- -------------------------------------------------------------
-- settlements — admin 전용 + mentor 본인 것 열람
-- (parent 정책 없음 = 접근 불가)
-- -------------------------------------------------------------
create policy "settlements_admin_all" on public.settlements
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "settlements_mentor_select_own" on public.settlements
  for select to authenticated
  using (mentor_id = public.my_mentor_id());

-- -------------------------------------------------------------
-- exceptions
-- -------------------------------------------------------------
create policy "exceptions_admin_all" on public.exceptions
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "exceptions_mentor_select" on public.exceptions
  for select to authenticated
  using (
    student_id is null or public.is_assigned_mentor(student_id)
  );

-- -------------------------------------------------------------
-- parent용 뷰
--
-- RLS는 row 단위 제어라 컬럼(notes, rate_amount)을 숨기려면 뷰가 필요.
-- security definer 뷰(기본값)는 기반 테이블 RLS를 우회하므로,
-- 뷰 내부 WHERE에서 접근 범위를 직접 강제한다.
-- auth.uid()는 호출자의 JWT 기준이므로 definer 뷰 안에서도 안전하다.
-- -------------------------------------------------------------

-- 세션: notes 제외, 자녀 것만
create view public.parent_sessions_view as
select
  s.id,
  s.student_id,
  s.mentor_id,
  s.date,
  s.start_time,
  s.end_time,
  s.status
from public.sessions s
where public.is_my_child(s.student_id);

-- 멘토: 이름·과목만 (rate_type/rate_amount 제외), 자녀 담당 멘토만
create view public.parent_mentors_view as
select distinct
  m.id,
  m.name,
  m.subjects
from public.mentors m
join public.assignments a on a.mentor_id = m.id
where public.is_my_child(a.student_id);

revoke all on public.parent_sessions_view from anon;
revoke all on public.parent_mentors_view from anon;
grant select on public.parent_sessions_view to authenticated;
grant select on public.parent_mentors_view to authenticated;
