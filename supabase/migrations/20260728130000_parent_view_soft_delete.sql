-- =============================================================
-- Phase 6.3 — parent_sessions_view가 소프트 삭제 세션을 감추도록 수정
--
-- parent_sessions_view는 deleted_at이 생기기 전(Phase 4)에 만들어졌다.
-- 그대로 두면 운영 화면에서 삭제한 세션이 학부모에게 계속 보인다.
--
-- 컬럼 구성은 그대로 둔다(notes 제외 유지) — 학부모 노출 범위를 넓히지 않는다.
-- =============================================================

create or replace view public.parent_sessions_view as
select
  s.id,
  s.student_id,
  s.mentor_id,
  s.date,
  s.start_time,
  s.end_time,
  s.status
from public.sessions s
where public.is_my_child(s.student_id)
  and s.deleted_at is null;

comment on view public.parent_sessions_view is
  '학부모용 세션 뷰 — notes 제외, 본인 자녀만, 소프트 삭제 제외.';
