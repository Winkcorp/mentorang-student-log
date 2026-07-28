-- =============================================================
-- Phase 6.6 — subject 전환 완료 (contract 단계)
--
-- 20260728100000에서 expand(subject_id 추가 + 백필 + 동기화 트리거)를 했고,
-- 앱 코드가 모두 subject_id로 옮겨졌으므로 이제 레거시를 걷어낸다.
--
--   * tasks / template_tasks / assignments 의 subject(text) 컬럼
--   * 두 컬럼을 이어주던 resolve_subject_ref 트리거와 함수
--   * mentors.subjects(text[]) — 담당 과목의 정본은 mentor_capabilities
--
-- 되돌리기 어려운 변경이므로 마지막 안전망으로 남은 미해석 값을 먼저 채운다.
-- =============================================================

-- -------------------------------------------------------------
-- 0. 안전망 — subject 텍스트는 있는데 subject_id가 비어 있는 행 정리
--    (트리거가 계속 동기화해왔으므로 정상이라면 0건이다)
-- -------------------------------------------------------------
insert into public.subjects (name, display_order)
select distinct s.subject, 900
from (
  select subject from public.tasks          where subject is not null and subject_id is null
  union
  select subject from public.template_tasks where subject is not null and subject_id is null
  union
  select subject from public.assignments    where subject is not null and subject_id is null
) as s
on conflict (name) do nothing;

update public.tasks t set subject_id = s.id
  from public.subjects s where t.subject = s.name and t.subject_id is null;
update public.template_tasks tt set subject_id = s.id
  from public.subjects s where tt.subject = s.name and tt.subject_id is null;
update public.assignments a set subject_id = s.id
  from public.subjects s where a.subject = s.name and a.subject_id is null;

-- -------------------------------------------------------------
-- 1. 동기화 트리거 제거 (컬럼보다 먼저 — 컬럼 참조가 사라져야 한다)
-- -------------------------------------------------------------
drop trigger if exists trg_tasks_resolve_subject          on public.tasks;
drop trigger if exists trg_template_tasks_resolve_subject on public.template_tasks;
drop trigger if exists trg_assignments_resolve_subject    on public.assignments;

drop function if exists public.resolve_subject_ref();

-- -------------------------------------------------------------
-- 2. 레거시 텍스트 컬럼 제거
--
-- subject_id는 nullable로 남긴다 — 과거 데이터 중 과목을 특정할 수 없는
-- 행이 있을 수 있고, NOT NULL로 조이면 그 이력을 지워야 한다.
-- 화면은 과목이 없으면 "미지정"으로 표시한다.
-- -------------------------------------------------------------
alter table public.tasks          drop column subject;
alter table public.template_tasks drop column subject;
alter table public.assignments    drop column subject;

-- -------------------------------------------------------------
-- 3. mentors.subjects 제거
--
-- parent_mentors_view가 이 컬럼을 노출하고 있어 뷰를 먼저 정리한다.
-- 학부모 화면은 담당 과목을 배정(assignments.subject_id)에서 읽으므로
-- 뷰에서는 이름만 남긴다 — 노출 범위를 넓히지 않는다.
-- -------------------------------------------------------------
drop view if exists public.parent_mentors_view;

create view public.parent_mentors_view as
select distinct
  m.id,
  m.name
from public.mentors m
join public.assignments a on a.mentor_id = m.id
where public.is_my_child(a.student_id);

revoke all on public.parent_mentors_view from anon;
grant select on public.parent_mentors_view to authenticated;

comment on view public.parent_mentors_view is
  '학부모용 멘토 뷰 — 이름만. rate_type/rate_amount는 어떤 경로로도 노출하지 않는다.';

alter table public.mentors drop column subjects;

comment on table public.mentor_capabilities is
  '멘토 담당 과목·세션유형의 정본. mentors.subjects(text[])를 대체했다.';
