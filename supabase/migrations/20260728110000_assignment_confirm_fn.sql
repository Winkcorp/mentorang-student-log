-- =============================================================
-- Phase 6.1 — 배정 확정 전환을 원자적으로 처리하는 함수
--
-- 왜 함수인가:
--   확정 전환은 "같은 조합의 나머지 candidate를 ended로" + "대상을 confirmed로"
--   두 동작이 한 몸이다. supabase-js로 두 번 UPDATE를 쏘면 사이에
--   partial unique index(조합당 confirmed 1건) 때문에 실패하거나,
--   순간적으로 확정이 0건인 상태가 노출된다.
--   plpgsql 함수는 한 트랜잭션에서 돌아 그 틈이 없다.
--
-- security invoker(기본값)로 둔다 — RLS가 그대로 적용되어야 하고,
-- assignments_admin_all 정책이 admin에게 이미 전체 권한을 준다.
-- =============================================================

create or replace function public.confirm_assignment(
  p_id      uuid,
  p_replace boolean default false
)
returns table (ok boolean, conflict_id uuid)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_target      public.assignments;
  v_conflict_id uuid;
begin
  select * into v_target from public.assignments where id = p_id;

  if v_target.id is null then
    raise exception 'assignment % not found', p_id;
  end if;

  -- 같은 (학생, 세션유형, 과목) 조합에서 이미 확정된 다른 배정
  -- NULL 과목(과목 무관 유형)도 같은 조합으로 취급해야 하므로 is not distinct from
  select a.id into v_conflict_id
  from public.assignments a
  where a.id <> p_id
    and a.status = 'confirmed'
    and a.student_id = v_target.student_id
    and a.session_type_id is not distinct from v_target.session_type_id
    and a.subject_id is not distinct from v_target.subject_id
  limit 1;

  -- 교체 의사를 밝히지 않았으면 DB 제약에 걸리기 전에 되돌려준다.
  -- 호출자는 이 conflict_id로 기존 배정을 보여주고 교체할지 물어본다.
  if v_conflict_id is not null and not p_replace then
    return query select false, v_conflict_id;
    return;
  end if;

  if v_conflict_id is not null then
    update public.assignments
      set status = 'ended',
          end_date = coalesce(end_date, current_date)
      where id = v_conflict_id;
  end if;

  -- 나머지 후보/제안은 자동 종료
  update public.assignments
    set status = 'ended',
        end_date = coalesce(end_date, current_date)
    where id <> p_id
      and student_id = v_target.student_id
      and session_type_id is not distinct from v_target.session_type_id
      and subject_id is not distinct from v_target.subject_id
      and status in ('candidate', 'proposed');

  update public.assignments
    set status = 'confirmed'
    where id = p_id;

  return query select true, null::uuid;
end;
$$;

comment on function public.confirm_assignment(uuid, boolean) is
  '배정을 confirmed로 전환하고 같은 조합의 나머지를 ended 처리한다. '
  '이미 확정된 배정이 있으면 p_replace=false일 때 (false, conflict_id)를 돌려준다.';

grant execute on function public.confirm_assignment(uuid, boolean) to authenticated;
