-- =============================================================
-- 테스트용 seed 데이터 (개발 환경 전용 — 운영 DB에 넣지 말 것)
-- 고정 UUID를 사용해 재실행해도 결과가 같도록 함 (idempotent)
--
-- UUID 대역
--   1111… 학부모      2222… 학생        3333… 멘토
--   4444… 배정        5555… 템플릿      6666… 템플릿항목
--   7777… 세션        8888… 예외기간    9999… 과목
--   aaaa… 세션유형    bbbb… 시간대      cccc… 공간
--   dddd… 멘토자격    eeee… 세션시리즈  ffff… 공간블록
-- =============================================================


-- -------------------------------------------------------------
-- 마스터: 과목 4개 (color·display_order는 화면이 그대로 사용)
-- -------------------------------------------------------------
insert into public.subjects (id, name, display_order, color) values
  ('99999999-9999-9999-9999-999999999901', '국어', 1, '#ef4444'),
  ('99999999-9999-9999-9999-999999999902', '영어', 2, '#3b82f6'),
  ('99999999-9999-9999-9999-999999999903', '수학', 3, '#22c55e'),
  ('99999999-9999-9999-9999-999999999904', '탐구', 4, '#a855f7')
on conflict do nothing;

-- -------------------------------------------------------------
-- 마스터: 세션유형 3개
--   공습     — 과목 무관, 진도 없음
--   국어PT   — 과목 필요, 진도 관리
--   수학클리닉 — 과목 필요, 진도 관리
-- -------------------------------------------------------------
insert into public.session_types
  (id, code, name, requires_subject, has_progress, display_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '공습', '공부습관GPT', false, false, 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', '국어PT', '국어 퍼스널트레이닝', true, true, 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', '수학클리닉', '수학 클리닉', true, true, 3)
on conflict do nothing;

-- -------------------------------------------------------------
-- 마스터: 시간대 A/B (실제 시각은 session_series가 보유, 여기는 기본값)
-- -------------------------------------------------------------
insert into public.time_slots
  (id, label, default_start_time, default_end_time, display_order) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'A', '16:30', '18:00', 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02', 'B', '19:00', '21:00', 2)
on conflict do nothing;

-- -------------------------------------------------------------
-- 마스터: 공간 2개 (공습룸은 정원 4 — 초과할 때만 충돌, 1:1룸은 단독 사용)
-- -------------------------------------------------------------
insert into public.rooms (id, name, capacity, display_order) values
  ('cccccccc-cccc-cccc-cccc-cccccccccc01', '공습룸', 4, 1),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02', '1:1룸A', null, 2)
on conflict do nothing;

-- 공간 사용 불가 구간 (충돌 검사 확인용 — 8/4 화요일 저녁 공습룸 점검)
insert into public.room_blocks (id, room_id, date, start_time, end_time, reason) values
  ('ffffffff-ffff-ffff-ffff-ffffffffff01',
   'cccccccc-cccc-cccc-cccc-cccccccccc01', '2026-08-04', '19:00', '21:00', '시설 점검')
on conflict do nothing;


-- -------------------------------------------------------------
-- 학부모 2명
-- -------------------------------------------------------------
insert into public.parents (id, name, contact) values
  ('11111111-1111-1111-1111-111111111101', '김학부모', '010-1111-1101'),
  ('11111111-1111-1111-1111-111111111102', '이학부모', '010-1111-1102')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- 학생 2명
-- -------------------------------------------------------------
insert into public.students (id, name, school, grade, parent_id, status) values
  ('22222222-2222-2222-2222-222222222201', '김학생', '한국고', '고2',
   '11111111-1111-1111-1111-111111111101', 'active'),
  ('22222222-2222-2222-2222-222222222202', '이학생', '서울고', '고3',
   '11111111-1111-1111-1111-111111111102', 'active')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- 멘토 2명 (시급제 / 회당제)
-- mentors.subjects는 DEPRECATED — 담당 과목의 정본은 mentor_capabilities.
-- 아래 값은 화면 전환 전까지의 잔여 표시용.
-- -------------------------------------------------------------
insert into public.mentors (id, name, subjects, rate_type, rate_amount, status) values
  ('33333333-3333-3333-3333-333333333301', '박멘토', array['국어', '영어'],
   'hourly', 25000.00, 'active'),
  ('33333333-3333-3333-3333-333333333302', '최멘토', array['수학'],
   'per_session', 60000.00, 'active')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- 멘토 자격 (세션유형 × 과목) — 과목 무관 유형은 subject_id를 비운다
-- -------------------------------------------------------------
insert into public.mentor_capabilities (id, mentor_id, session_type_id, subject_id) values
  -- 박멘토: 공습(과목 무관), 국어PT(국어)
  ('dddddddd-dddd-dddd-dddd-dddddddddd01',
   '33333333-3333-3333-3333-333333333301',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', null),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02',
   '33333333-3333-3333-3333-333333333301',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
   '99999999-9999-9999-9999-999999999901'),
  -- 최멘토: 공습(과목 무관), 수학클리닉(수학)
  ('dddddddd-dddd-dddd-dddd-dddddddddd03',
   '33333333-3333-3333-3333-333333333302',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', null),
  ('dddddddd-dddd-dddd-dddd-dddddddddd04',
   '33333333-3333-3333-3333-333333333302',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
   '99999999-9999-9999-9999-999999999903')
on conflict do nothing;


-- -------------------------------------------------------------
-- 배정 (subject는 넣지 않는다 — subject_id에서 트리거가 채운다)
--   4401 확정  : 김학생 · 박멘토 · 국어PT · 국어 (진도 40강)
--   4402 확정  : 이학생 · 박멘토 · 공습 (과목 무관)
--   4403 후보  : 김학생 · 최멘토 · 수학클리닉 · 수학
--   4404 후보  : 김학생 · 박멘토 · 수학클리닉 · 수학  ← 같은 조합 후보 2명
-- -------------------------------------------------------------
insert into public.assignments
  (id, student_id, mentor_id, session_type_id, subject_id, status,
   start_date, end_date, memo, progress_unit_label, progress_total) values
  ('44444444-4444-4444-4444-444444444401',
   '22222222-2222-2222-2222-222222222201',
   '33333333-3333-3333-3333-333333333301',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
   '99999999-9999-9999-9999-999999999901',
   'confirmed', '2026-07-20', null, null, '강', 40),

  ('44444444-4444-4444-4444-444444444402',
   '22222222-2222-2222-2222-222222222202',
   '33333333-3333-3333-3333-333333333301',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
   null,
   'confirmed', '2026-07-20', null, null, null, null),

  ('44444444-4444-4444-4444-444444444403',
   '22222222-2222-2222-2222-222222222201',
   '33333333-3333-3333-3333-333333333302',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
   '99999999-9999-9999-9999-999999999903',
   'candidate', '2026-08-03', null, '수요일 B타임 가능한지 확인 필요', '단원', 12),

  ('44444444-4444-4444-4444-444444444404',
   '22222222-2222-2222-2222-222222222201',
   '33333333-3333-3333-3333-333333333301',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03',
   '99999999-9999-9999-9999-999999999903',
   'candidate', '2026-08-03', null, '국어PT와 요일 겹침 — 과부하 우려', '단원', 12)
on conflict (id) do nothing;


-- -------------------------------------------------------------
-- 세션 시리즈: 4401(확정 배정) 화요일 B타임 4주, 1:1룸A
-- 회차 = 07/21, 07/28, 08/04, 08/11
--   ※ 08/04는 김학생 예외기간(8/3~8/5)과 겹쳐 생성에서 제외되는 케이스
-- -------------------------------------------------------------
insert into public.session_series
  (id, assignment_id, time_slot_id, room_id, day_of_week,
   start_time, end_time, start_date, total_weeks, status) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
   '44444444-4444-4444-4444-444444444401',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
   'cccccccc-cccc-cccc-cccc-cccccccccc02',
   2, '19:00', '21:00', '2026-07-21', 4, 'active')
on conflict (id) do nothing;

-- -------------------------------------------------------------
-- 세션
--   7701~7705: 시리즈 없는 v1 이력 (완료 2 / 노쇼 1 / 취소+대체 1쌍)
--   7706~7708: 시리즈 소속 (1회차 완료 → 2회차 예정, 진도 이어붙기 확인용)
-- -------------------------------------------------------------
insert into public.sessions
  (id, student_id, mentor_id, date, start_time, end_time, status, notes,
   related_session_id, series_id, room_id, time_slot_id,
   week_number, progress_from, progress_to) values

  ('77777777-7777-7777-7777-777777777701',
   '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301',
   '2026-07-20', '19:00', '21:00', 'completed', '집중 잘함',
   null, null, null, null, null, null, null),

  ('77777777-7777-7777-7777-777777777702',
   '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333301',
   '2026-07-20', '21:00', '22:30', 'completed', null,
   null, null, null, null, null, null, null),

  ('77777777-7777-7777-7777-777777777703',
   '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301',
   '2026-07-21', '19:00', '21:00', 'no_show', '학생 연락 없이 불참',
   null, null, null, null, null, null, null),

  -- 멘토 귀책 취소 → 대체수업으로 연결 (정산 이중계산 방지 확인용)
  ('77777777-7777-7777-7777-777777777704',
   '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333301',
   '2026-07-21', '21:00', '22:30', 'canceled', '멘토 사정으로 취소',
   null, null, null, null, null, null, null),

  ('77777777-7777-7777-7777-777777777705',
   '22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333301',
   '2026-07-22', '21:00', '22:30', 'makeup', '7/21 취소분 대체',
   '77777777-7777-7777-7777-777777777704', null, null, null, null, null, null),

  -- 시리즈 1회차: 완료 + 진도 1~3강
  ('77777777-7777-7777-7777-777777777706',
   '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301',
   '2026-07-21', '19:00', '21:00', 'completed', '1~3강 진행',
   null,
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
   'cccccccc-cccc-cccc-cccc-cccccccccc02',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
   1, 1, 3),

  -- 시리즈 2회차: 예정 — progress_from은 직전 회차 progress_to(3)를 이어받음
  ('77777777-7777-7777-7777-777777777707',
   '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301',
   '2026-07-28', '19:00', '21:00', 'scheduled', null,
   null,
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
   'cccccccc-cccc-cccc-cccc-cccccccccc02',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
   2, 3, null),

  -- 시리즈 4회차: 예정 (3회차 08/04는 예외기간과 겹쳐 생성되지 않은 상태)
  ('77777777-7777-7777-7777-777777777708',
   '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301',
   '2026-08-11', '19:00', '21:00', 'scheduled', null,
   null,
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
   'cccccccc-cccc-cccc-cccc-cccccccccc02',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
   4, null, null)
on conflict (id) do nothing;


-- -------------------------------------------------------------
-- 학습 계획 템플릿 (4주) + item_type별 항목 4종
-- subject는 넣지 않는다 — subject_id에서 트리거가 채운다
-- -------------------------------------------------------------
insert into public.study_plan_templates (id, name, duration_weeks) values
  ('55555555-5555-5555-5555-555555555501', '이과_A_4주', 4)
on conflict (id) do nothing;

insert into public.template_tasks (id, template_id, subject_id, item_type, config) values
  -- 매일 반복
  ('66666666-6666-6666-6666-666666666601',
   '55555555-5555-5555-5555-555555555501',
   '99999999-9999-9999-9999-999999999901', 'daily_routine',
   '{"instruction": "강기본 하루 2강씩", "days": "mon-sun"}'),
  -- 순차 진행 + 복습
  ('66666666-6666-6666-6666-666666666602',
   '55555555-5555-5555-5555-555555555501',
   '99999999-9999-9999-9999-999999999902', 'sequential',
   '{"unit_label": "Day", "start_unit": 25, "units_per_period": 3, "period_days": 1, "review_lag_days": 3, "total_units": 60}'),
  -- 조건부 (트리거 → 액션)
  ('66666666-6666-6666-6666-666666666603',
   '55555555-5555-5555-5555-555555555501',
   '99999999-9999-9999-9999-999999999903', 'conditional',
   '{"trigger": "수1 인강 1강 시청", "action": "마플 해당 단원 문제 풀이"}'),
  -- 1회성
  ('66666666-6666-6666-6666-666666666604',
   '55555555-5555-5555-5555-555555555501',
   '99999999-9999-9999-9999-999999999901', 'one_time',
   '{"week_number": 1, "day_of_week": "sat", "content": "모의고사 국어 기출 1회분"}')
on conflict (id) do nothing;


-- -------------------------------------------------------------
-- 예외 기간 (김학생 가족여행) — 시리즈 3회차(08/04)와 겹친다
-- -------------------------------------------------------------
insert into public.exceptions
  (id, student_id, start_date, end_date, reason, suppress_generation) values
  ('88888888-8888-8888-8888-888888888801',
   '22222222-2222-2222-2222-222222222201',
   '2026-08-03', '2026-08-05', '가족여행', true)
on conflict (id) do nothing;
