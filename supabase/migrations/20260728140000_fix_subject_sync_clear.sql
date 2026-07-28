-- =============================================================
-- Phase 6.4 — subject 동기화 트리거가 "과목 비우기"를 막던 문제 수정
--
-- 증상:
--   update assignments set subject_id = null  →  트리거가 레거시 subject
--   텍스트('영어')를 보고 subject_id를 다시 채워버린다. 결과적으로 전환
--   기간 동안 과목을 비울 방법이 없다.
--   (과목 무관 세션유형으로 배정을 바꾸는 경우가 실제로 여기 걸린다)
--
-- 원인:
--   resolve_subject_ref가 "subject_id가 비어 있음"을 항상 "아직 안 채워짐"
--   으로 해석했다. "명시적으로 비웠음"과 구분하지 못한 것.
--
-- 수정:
--   UPDATE에서 subject_id가 있다가 null이 되면 = 명시적으로 비운 것으로 보고
--   레거시 텍스트도 함께 비운다. 반대 방향(subject 텍스트를 비운 경우)도 동일.
--
-- 이 트리거는 subject 텍스트 컬럼을 DROP하는 contract 단계에서 함께 제거된다.
-- =============================================================

create or replace function public.resolve_subject_ref()
returns trigger
language plpgsql
as $$
declare
  v_id   uuid;
  v_name text;
begin
  -- UPDATE에서 한쪽을 명시적으로 비운 경우 → 다른 쪽도 비운다.
  -- (재유도하면 사용자가 비운 값이 되살아난다)
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

-- 이미 잘못 채워진 데이터 정리:
-- 과목을 요구하지 않는 세션유형(requires_subject=false)인데 과목이 붙어 있는 배정
update public.assignments a
  set subject_id = null,
      subject    = null
  from public.session_types t
  where a.session_type_id = t.id
    and t.requires_subject = false
    and (a.subject_id is not null or a.subject is not null);
