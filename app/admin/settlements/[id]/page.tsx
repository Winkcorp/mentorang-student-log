import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  calculateSettlement,
  type RateType,
  type SettlementSession,
} from "@/lib/settlement/calculate";

const STATUS_LABEL: Record<string, string> = {
  pending: "확인 대기",
  confirmed: "확정",
  paid: "지급 완료",
};

const SESSION_LABEL: Record<string, string> = {
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

const RATE_LABEL: Record<string, string> = {
  hourly: "시급",
  per_session: "회당",
  flat: "고정",
};

function minutes(s: { start_time: string; end_time: string }) {
  const [sh, sm] = String(s.start_time).split(":").map(Number);
  const [eh, em] = String(s.end_time).split(":").map(Number);
  return eh * 60 + em - sh * 60 - sm;
}

/**
 * 정산 상세 — 근무 내역(세션별 포함/제외)과 계산 과정을 투명하게 표시.
 */
export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: settlement } = await supabase
    .from("settlements")
    .select(
      "id, mentor_id, period_start, period_end, total_hours, total_sessions, amount, adjustment_amount, adjustment_reason, status, mentors(id, name, rate_type, rate_amount)",
    )
    .eq("id", id)
    .single();

  if (!settlement) notFound();
  const mentor = Array.isArray(settlement.mentors)
    ? settlement.mentors[0]
    : settlement.mentors;

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, date, start_time, end_time, status, related_session_id, students(name)",
    )
    .eq("mentor_id", settlement.mentor_id)
    .gte("date", settlement.period_start)
    .lte("date", settlement.period_end)
    .order("date")
    .order("start_time");

  const calc = calculateSettlement({
    rateType: mentor!.rate_type as RateType,
    rateAmount: Number(mentor!.rate_amount),
    sessions: (sessions ?? []) as unknown as SettlementSession[],
  });
  const countedSet = new Set(calc.countedSessionIds);
  const replacedSet = new Set(calc.replacedSessionIds);

  const fmt = (n: number | string) => Number(n).toLocaleString();
  const finalAmount = calc.amount + Number(settlement.adjustment_amount ?? 0);

  const formula =
    mentor!.rate_type === "hourly"
      ? `${calc.totalHours}시간 × ${fmt(mentor!.rate_amount)}원 = ${fmt(calc.amount)}원`
      : mentor!.rate_type === "per_session"
        ? `${calc.totalSessions}회 × ${fmt(mentor!.rate_amount)}원 = ${fmt(calc.amount)}원`
        : `기간 고정액 ${fmt(mentor!.rate_amount)}원${calc.totalSessions === 0 ? " (세션 0회 → 0원)" : ""}`;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/settlements" className="text-xs font-medium text-blue-600 hover:underline">
          ← 정산 목록
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-bold text-gray-900">{mentor!.name} 정산 내역</h1>
          <span className="text-sm text-gray-400">
            {settlement.period_start} ~ {settlement.period_end}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {STATUS_LABEL[settlement.status]}
          </span>
        </div>
      </div>

      {/* 계산 과정 */}
      <div className="rounded-2xl border border-gray-200/70 bg-white p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          계산 과정
        </h2>
        <ol className="space-y-2 text-sm text-gray-700">
          <li>
            <span className="mr-2 text-gray-300">1</span>
            기간 내 세션 {sessions?.length ?? 0}건 중 집계 대상{" "}
            <b>{calc.totalSessions}건</b>
            <span className="ml-1 text-xs text-gray-400">
              (취소 제외 · 대체수업의 원 세션 제외)
            </span>
          </li>
          <li>
            <span className="mr-2 text-gray-300">2</span>
            진행 시간 합계 <b>{calc.totalHours}시간</b>
            <span className="ml-1 text-xs text-gray-400">
              ({calc.totalMinutes}분, 분 단위 집계 후 시간 환산)
            </span>
          </li>
          <li>
            <span className="mr-2 text-gray-300">3</span>
            {RATE_LABEL[mentor!.rate_type]} 계산: <b>{formula}</b>
          </li>
          {settlement.adjustment_amount != null && (
            <li>
              <span className="mr-2 text-gray-300">4</span>
              수동 조정 <b>{fmt(settlement.adjustment_amount)}원</b>
              <span className="ml-1 text-xs text-gray-400">
                ({settlement.adjustment_reason})
              </span>
            </li>
          )}
        </ol>
        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm">
          최종 지급액 <b className="text-base text-gray-900">{fmt(finalAmount)}원</b>
        </div>
      </div>

      {/* 근무 내역 */}
      <div className="rounded-2xl border border-gray-200/70 bg-white p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          근무 내역 ({sessions?.length ?? 0}건)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3 font-semibold">날짜</th>
                <th className="py-2 pr-3 font-semibold">학생</th>
                <th className="py-2 pr-3 font-semibold">시간</th>
                <th className="py-2 pr-3 font-semibold">상태</th>
                <th className="py-2 pr-3 text-right font-semibold">진행</th>
                <th className="py-2 text-right font-semibold">집계</th>
              </tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s) => {
                const student = Array.isArray(s.students) ? s.students[0] : s.students;
                const counted = countedSet.has(s.id);
                const replaced = replacedSet.has(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-50 ${counted ? "" : "text-gray-300"}`}
                  >
                    <td className="py-2 pr-3">{s.date}</td>
                    <td className="py-2 pr-3">{student?.name}</td>
                    <td className="py-2 pr-3">
                      {String(s.start_time).slice(0, 5)}~{String(s.end_time).slice(0, 5)}
                    </td>
                    <td className="py-2 pr-3">
                      {SESSION_LABEL[s.status]}
                      {s.status === "makeup" && (
                        <span className="ml-1 text-[10px] text-violet-400">(원 세션 연결)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {counted ? `${Math.round((minutes(s as never) / 60) * 100) / 100}h` : "―"}
                    </td>
                    <td className="py-2 text-right">
                      {counted ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                          포함
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px]">
                          {replaced ? "대체됨" : s.status === "canceled" ? "취소" : "제외"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!sessions?.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-gray-300">
                    기간 내 세션이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
