/**
 * 정산 검증 스크립트 (Phase 5 검증 — 실제 DB로 멱등성/이중정산 확인)
 *
 * 실행: node scripts/verify-settlement.mjs
 * 필요: .env.local + 마이그레이션·seed 적용된 DB
 *
 * seed 세션(박멘토, 2026-07):
 *   completed 2h + completed 1.5h + no_show 2h + canceled(대체됨) + makeup 1.5h
 *   → 집계 4세션 / 7.0h / hourly 25,000원 = 175,000원 (canceled 원 세션 제외)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const MENTOR_1 = "33333333-3333-3333-3333-333333333301";
const PERIOD = { start: "2026-07-01", end: "2026-07-31" };

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  // 기존 테스트 정산 정리
  await admin
    .from("settlements")
    .delete()
    .eq("mentor_id", MENTOR_1)
    .eq("period_start", PERIOD.start)
    .eq("period_end", PERIOD.end);

  // 1) 세션 집계 확인 (makeup의 원 세션 제외)
  const { data: sessions } = await admin
    .from("sessions")
    .select("id, start_time, end_time, status, related_session_id")
    .eq("mentor_id", MENTOR_1)
    .gte("date", PERIOD.start)
    .lte("date", PERIOD.end);

  const replaced = new Set(
    sessions.filter((s) => s.status === "makeup" && s.related_session_id)
      .map((s) => s.related_session_id),
  );
  const counted = sessions.filter(
    (s) => ["completed", "no_show", "makeup"].includes(s.status) && !replaced.has(s.id),
  );
  const minutes = counted.reduce((sum, s) => {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    return sum + (eh * 60 + em - sh * 60 - sm);
  }, 0);

  check("makeup 원 세션이 집계에서 제외됨 (이중 정산 없음)",
    counted.length === 4, `집계 ${counted.length}세션 (기대 4)`);
  check("시간 집계 7.0h", minutes === 420, `${minutes}분`);

  // 2) 정산 1차 저장
  const row = {
    mentor_id: MENTOR_1,
    period_start: PERIOD.start,
    period_end: PERIOD.end,
    total_hours: minutes / 60,
    total_sessions: counted.length,
    amount: (minutes / 60) * 25000,
    status: "pending",
  };
  const { error: firstErr } = await admin.from("settlements").insert(row);
  check("정산 1차 저장 성공", !firstErr, firstErr?.message ?? "");

  // 3) 같은 mentor+period 중복 저장 → UNIQUE 제약으로 차단되어야 함
  const { error: dupErr } = await admin.from("settlements").insert(row);
  check("같은 멘토·기간 중복 저장 차단 (UNIQUE)",
    dupErr?.code === "23505", dupErr ? dupErr.code : "에러 없음(중복 생성됨!)");

  // 4) 레코드가 정확히 1건인지
  const { count } = await admin
    .from("settlements")
    .select("id", { count: "exact", head: true })
    .eq("mentor_id", MENTOR_1)
    .eq("period_start", PERIOD.start)
    .eq("period_end", PERIOD.end);
  check("정산 레코드 1건 유지", count === 1, `count=${count}`);

  // 정리
  await admin
    .from("settlements")
    .delete()
    .eq("mentor_id", MENTOR_1)
    .eq("period_start", PERIOD.start)
    .eq("period_end", PERIOD.end)
    .eq("status", "pending");

  const passed = results.filter(Boolean).length;
  console.log(`\n== 결과: ${passed}/${results.length} 통과 ==`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error("실행 오류:", e.message);
  process.exit(1);
});
