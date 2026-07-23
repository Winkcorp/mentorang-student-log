-- =============================================================
-- Phase 3.5 — tasks에 템플릿 "항목" 단위 출처 추가
--
-- source_template_id(템플릿 단위)만으로는 done 체크 시 반응형 생성
-- (sequential 복습, conditional 액션)에 필요한 item_type/config를 알 수 없다.
-- 항목 단위 출처를 추가해 과제 ↔ template_tasks.config를 연결한다.
-- =============================================================

alter table public.tasks
  add column source_template_task_id uuid
    references public.template_tasks (id) on delete set null;

create index idx_tasks_source_template_task_id
  on public.tasks (source_template_task_id);
