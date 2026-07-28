/**
 * RLS 격리 검증 스크립트 (Phase 4 검증 — 실제 계정으로 교차 접근 시도)
 *
 * 실행: node scripts/verify-rls.mjs
 * 필요: .env.local (URL/anon/service_role), 마이그레이션+seed 적용된 DB
 *
 * service_role로 테스트 계정(학부모 A/B, 멘토, 승인대기)을 만들고,
 * 각 계정으로 로그인한 anon 클라이언트에서 금지된 접근을 실제로 시도한다.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ---- .env.local 로드 ----
const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("`.env.local`에 URL/anon/service_role 키가 필요합니다.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// seed.sql의 고정 UUID
const PARENT_A = "11111111-1111-1111-1111-111111111101"; // 김학부모 (자녀: 김학생)
const PARENT_B = "11111111-1111-1111-1111-111111111102"; // 이학부모 (자녀: 이학생)
const STUDENT_A = "22222222-2222-2222-2222-222222222201"; // 김학생
const STUDENT_B = "22222222-2222-2222-2222-222222222202"; // 이학생
const MENTOR_1 = "33333333-3333-3333-3333-333333333301"; // 박멘토 (둘 다 담당)

const PASSWORD = "rls-test-password-1!";
const accounts = [
  { email: "rls-parent-a@test.local", role: "parent", parent_id: PARENT_A },
  { email: "rls-parent-b@test.local", role: "parent", parent_id: PARENT_B },
  { email: "rls-mentor@test.local", role: "mentor", mentor_id: MENTOR_1 },
  { email: "rls-pending@test.local", role: null },
];

async function ensureAccount(acc) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list.users.find((u) => u.email === acc.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: acc.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`계정 생성 실패 ${acc.email}: ${error.message}`);
    user = data.user;
  }
  const { error: upErr } = await admin
    .from("profiles")
    .update({
      role: acc.role,
      parent_id: acc.parent_id ?? null,
      mentor_id: acc.mentor_id ?? null,
    })
    .eq("id", user.id);
  if (upErr) throw new Error(`프로필 설정 실패 ${acc.email}: ${upErr.message}`);
  return user;
}

async function signedInClient(email) {
  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`로그인 실패 ${email}: ${error.message}`);
  return client;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("== 테스트 계정 준비 ==");
  for (const acc of accounts) await ensureAccount(acc);

  const parentA = await signedInClient("rls-parent-a@test.local");
  const parentB = await signedInClient("rls-parent-b@test.local");
  const mentor = await signedInClient("rls-mentor@test.local");
  const pending = await signedInClient("rls-pending@test.local");

  console.log("\n== 학부모 A: 본인 자녀 접근 (허용되어야 함) ==");
  {
    const { data } = await parentA.from("students").select("id");
    check("A: 자녀 목록 조회", (data ?? []).length === 1 && data[0].id === STUDENT_A,
      `rows=${(data ?? []).length}`);
    const { data: t } = await parentA.from("tasks").select("id").eq("student_id", STUDENT_A);
    check("A: 자녀 tasks 조회 가능", t !== null);
  }

  console.log("\n== 학부모 A: B 학생 데이터 교차 접근 (차단되어야 함) ==");
  {
    const { data } = await parentA.from("tasks").select("id").eq("student_id", STUDENT_B);
    check("A→B tasks 직접 조회 차단", (data ?? []).length === 0, `rows=${(data ?? []).length}`);
    const { data: s } = await parentA.from("students").select("id").eq("id", STUDENT_B);
    check("A→B 학생 정보 차단", (s ?? []).length === 0);
    const { data: v } = await parentA.from("parent_sessions_view").select("id").eq("student_id", STUDENT_B);
    check("A→B 세션 뷰 차단", (v ?? []).length === 0);
  }

  console.log("\n== 학부모 A: 금지 테이블/컬럼 (차단되어야 함) ==");
  {
    const { data } = await parentA.from("sessions").select("id, notes");
    check("sessions 원본 테이블 차단 (notes 보호)", (data ?? []).length === 0,
      `rows=${(data ?? []).length}`);
    const { data: m, error: mErr } = await parentA.from("mentors").select("rate_amount, rate_type");
    check("mentors.rate_* 차단", mErr !== null || (m ?? []).length === 0);
    const { data: st, error: stErr } = await parentA.from("settlements").select("*");
    check("settlements 차단", stErr !== null || (st ?? []).length === 0);
    const { data: view } = await parentA.from("parent_mentors_view").select("*");
    const hasRate = (view ?? []).some((r) => "rate_amount" in r || "rate_type" in r);
    check("parent_mentors_view에 rate 컬럼 없음", !hasRate && (view ?? []).length > 0,
      `rows=${(view ?? []).length}`);
  }

  console.log("\n== 학부모 A: 쓰기 시도 (차단되어야 함) ==");
  {
    const { data } = await parentA.from("tasks")
      .update({ status: "done" }).eq("student_id", STUDENT_A).select("id");
    check("자녀 task 상태 변경 차단 (read-only)", (data ?? []).length === 0,
      `updated=${(data ?? []).length}`);
  }

  console.log("\n== 학부모 B: 자기 자녀만 보임 ==");
  {
    const { data } = await parentB.from("students").select("id");
    check("B: 자녀 목록 = 본인 자녀만", (data ?? []).length === 1 && data[0].id === STUDENT_B);
  }

  console.log("\n== 멘토: 담당 학생만 + settlements 본인 것만 ==");
  {
    const { data } = await mentor.from("students").select("id");
    check("멘토: 담당 학생 조회 (2명)", (data ?? []).length === 2, `rows=${(data ?? []).length}`);
    const { data: sess } = await mentor.from("sessions").select("id, notes");
    check("멘토: 본인 세션 notes 접근 가능", (sess ?? []).length > 0);
    const { data: other } = await mentor.from("settlements").select("id").neq("mentor_id", MENTOR_1);
    check("멘토: 타 멘토 정산 차단", (other ?? []).length === 0);
  }

  console.log("\n== 승인 대기(role=null): 전부 차단 ==");
  {
    const { data: s } = await pending.from("students").select("id");
    const { data: t } = await pending.from("tasks").select("id");
    const { data: m } = await pending.from("mentors").select("id");
    check("role=null: students/tasks/mentors 전부 0건",
      (s ?? []).length === 0 && (t ?? []).length === 0 && (m ?? []).length === 0);

    // 마스터도 승인 전에는 보이면 안 된다
    const { data: sub } = await pending.from("subjects").select("id");
    const { data: st } = await pending.from("session_types").select("id");
    const { data: rm } = await pending.from("rooms").select("id");
    check("role=null: 마스터(subjects/session_types/rooms) 전부 0건",
      (sub ?? []).length === 0 && (st ?? []).length === 0 && (rm ?? []).length === 0,
      `subjects=${(sub ?? []).length} types=${(st ?? []).length} rooms=${(rm ?? []).length}`);
  }

  // ---- 스키마 v2 신규 테이블 ------------------------------------------
  console.log("\n== 마스터 읽기: 승인된 역할은 허용 ==");
  {
    const { data: p } = await parentA.from("subjects").select("id, name");
    check("학부모: 과목 마스터 읽기 가능 (과제 표시에 필요)", (p ?? []).length > 0,
      `rows=${(p ?? []).length}`);
    const { data: m } = await mentor.from("session_types").select("id");
    check("멘토: 세션유형 마스터 읽기 가능", (m ?? []).length > 0);
  }

  console.log("\n== 마스터 쓰기: admin만 (차단되어야 함) ==");
  {
    const { data, error } = await parentA.from("subjects")
      .insert({ name: `침입-${Date.now()}`, display_order: 999 }).select("id");
    check("학부모: 과목 추가 차단", error !== null || (data ?? []).length === 0);

    const { data: m, error: mErr } = await mentor.from("rooms")
      .insert({ name: `침입룸-${Date.now()}` }).select("id");
    check("멘토: 공간 추가 차단", mErr !== null || (m ?? []).length === 0);
  }

  console.log("\n== 운영 테이블: 학부모 접근 차단 ==");
  {
    for (const table of [
      "mentor_capabilities",
      "session_series",
      "room_blocks",
      "attendance_overrides",
    ]) {
      const { data, error } = await parentA.from(table).select("id");
      check(`학부모: ${table} 차단`, error !== null || (data ?? []).length === 0,
        `rows=${(data ?? []).length}`);
    }
  }

  console.log("\n== 운영 테이블: 멘토는 본인 범위만 ==");
  {
    const { data: caps } = await mentor.from("mentor_capabilities")
      .select("id, mentor_id");
    const onlyMine = (caps ?? []).every((c) => c.mentor_id === MENTOR_1);
    check("멘토: 본인 자격만 조회", onlyMine, `rows=${(caps ?? []).length}`);

    const { data: other } = await mentor.from("mentor_capabilities")
      .select("id").neq("mentor_id", MENTOR_1);
    check("멘토: 타 멘토 자격 차단", (other ?? []).length === 0);

    const { data: series } = await mentor.from("session_series").select("id");
    check("멘토: 담당 배정의 시리즈만 조회", series !== null,
      `rows=${(series ?? []).length}`);

    const { data: w, error: wErr } = await mentor.from("session_series")
      .insert({
        assignment_id: "44444444-4444-4444-4444-444444444401",
        time_slot_id: "00000000-0000-0000-0000-000000000000",
        day_of_week: 1, start_time: "10:00", end_time: "11:00",
        start_date: "2026-09-01", total_weeks: 1,
      }).select("id");
    check("멘토: 시리즈 생성 차단 (admin 전용)",
      wErr !== null || (w ?? []).length === 0);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== 결과: ${results.length - failed.length}/${results.length} 통과 ==`);
  if (failed.length) {
    console.log("실패 항목:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("실행 오류:", e.message);
  process.exit(1);
});
