import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dates";
import { RunButton } from "./RunButton";
import {
  adjustSettlement,
  confirmSettlement,
  markSettlementPaid,
  reopenSettlement,
} from "./actions";

const STATUS_LABEL: Record<string, string> = {
  pending: "확인 대기",
  confirmed: "확정",
  paid: "지급 완료",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
};

function shiftMonth(ym: string, diff: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + diff, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function AdminSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentYm;
  const { start, end } = monthRange(ym);

  const supabase = await createClient();
  const { data: settlements } = await supabase
    .from("settlements")
    .select(
      "id, mentor_id, period_start, period_end, total_hours, total_sessions, amount, adjustment_amount, adjustment_reason, status, updated_at, mentors(id, name, rate_type)",
    )
    .eq("period_start", start)
    .eq("period_end", end)
    .order("created_at");

  // 확정 이후 세션 상태가 변경됐는지 감지 (정산 updated_at보다 최근에
  // 수정된 기간 내 세션이 있으면 경고)
  const staleIds = new Set<string>();
  await Promise.all(
    (settlements ?? [])
      .filter((s) => s.status !== "pending")
      .map(async (s) => {
        const { count } = await supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("mentor_id", s.mentor_id)
          .gte("date", s.period_start)
          .lte("date", s.period_end)
          .gt("updated_at", s.updated_at);
        if (count) staleIds.add(s.id);
      }),
  );

  const fmt = (n: number | string) => Number(n).toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">정산</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin/settlements?month=${shiftMonth(ym, -1)}`}
            className="rounded-lg border border-gray-300 px-2 py-1 hover:bg-gray-100"
          >
            ←
          </Link>
          <span className="font-semibold text-gray-900">{ym}</span>
          <Link
            href={`/admin/settlements?month=${shiftMonth(ym, 1)}`}
            className="rounded-lg border border-gray-300 px-2 py-1 hover:bg-gray-100"
          >
            →
          </Link>
        </div>
      </div>

      <RunButton ym={ym} />

      <ul className="space-y-3">
        {(settlements ?? []).map((s) => {
          const mentor = Array.isArray(s.mentors) ? s.mentors[0] : s.mentors;
          const finalAmount =
            Number(s.amount) + Number(s.adjustment_amount ?? 0);
          return (
            <li
              key={s.id}
              className="space-y-3 rounded-2xl border border-gray-200/70 bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <Link
                    href={`/admin/settlements/${s.id}`}
                    className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                    title="근무 내역·계산 과정 보기"
                  >
                    {mentor?.name}
                  </Link>
                  <Link
                    href={`/admin/settlements/${s.id}`}
                    className="ml-1.5 text-xs text-blue-600 hover:underline"
                  >
                    내역
                  </Link>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                  {staleIds.has(s.id) && (
                    <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      ⚠ 정산 이후 세션 상태가 변경되었습니다
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "pending" && (
                    <form action={confirmSettlement}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded-xl bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
                      >
                        확정
                      </button>
                    </form>
                  )}
                  {s.status === "confirmed" && (
                    <>
                      <form action={markSettlementPaid}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                        >
                          지급 완료
                        </button>
                      </form>
                      <form action={reopenSettlement}>
                        <input type="hidden" name="id" value={s.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          되돌리기
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-gray-400">진행 시간</p>
                  {fmt(s.total_hours)}시간
                </div>
                <div>
                  <p className="text-xs text-gray-400">세션 수</p>
                  {s.total_sessions}회
                </div>
                <div>
                  <p className="text-xs text-gray-400">계산액</p>
                  {fmt(s.amount)}원
                </div>
                <div>
                  <p className="text-xs text-gray-400">최종 지급액</p>
                  <b>{fmt(finalAmount)}원</b>
                  {s.adjustment_amount != null && (
                    <span className="ml-1 text-xs text-amber-600">
                      (조정 {fmt(s.adjustment_amount)}원
                      {s.adjustment_reason ? ` · ${s.adjustment_reason}` : ""})
                    </span>
                  )}
                </div>
              </div>

              {s.status !== "paid" && (
                <details>
                  <summary className="cursor-pointer text-xs text-gray-500 hover:underline">
                    수동 조정
                  </summary>
                  <form
                    action={adjustSettlement}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        조정액 (음수 가능, 비우면 해제)
                      </label>
                      <input
                        name="adjustmentAmount"
                        type="number"
                        step="0.01"
                        defaultValue={s.adjustment_amount ?? ""}
                        className="w-36 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">
                        사유 (조정 시 필수)
                      </label>
                      <input
                        name="adjustmentReason"
                        defaultValue={s.adjustment_reason ?? ""}
                        className="w-52 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                    >
                      저장
                    </button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
        {!settlements?.length && (
          <p className="text-sm text-gray-400">
            {ym} 정산 내역이 없습니다. 위 버튼으로 정산을 실행하세요.
          </p>
        )}
      </ul>
    </div>
  );
}
