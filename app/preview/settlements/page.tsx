import { AppShell } from "@/components/AppShell";

const NAV = [
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/plan-assign", label: "계획 배정" },
  { href: "/preview/settlements", label: "정산" },
];

const SETTLEMENTS = [
  {
    mentor: "박멘토",
    status: "pending" as const,
    hours: "24.50",
    sessions: 14,
    amount: 612500,
    adjustment: null as number | null,
    reason: null as string | null,
    stale: false,
  },
  {
    mentor: "최멘토",
    status: "confirmed" as const,
    hours: "18.00",
    sessions: 12,
    amount: 600000,
    adjustment: -50000,
    reason: "교재비 선지급 차감",
    stale: true,
  },
  {
    mentor: "정멘토",
    status: "paid" as const,
    hours: "0.00",
    sessions: 8,
    amount: 400000,
    adjustment: null,
    reason: null,
    stale: false,
  },
];

const STATUS_LABEL = { pending: "확인 대기", confirmed: "확정", paid: "지급 완료" };
const STATUS_STYLE = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
};

export default function PreviewSettlementsPage() {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <AppShell title="관리자" nav={NAV} userLabel="admin@mentorang.kr">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">정산</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-lg border border-gray-300 px-2 py-1">←</span>
            <span className="font-semibold text-gray-900">2026-07</span>
            <span className="rounded-lg border border-gray-300 px-2 py-1">→</span>
          </div>
        </div>

        <button className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
          2026-07 정산 실행 (활성 멘토 전원)
        </button>

        <ul className="space-y-3">
          {SETTLEMENTS.map((s) => {
            const finalAmount = s.amount + (s.adjustment ?? 0);
            return (
              <li
                key={s.mentor}
                className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold text-gray-900">
                      {s.mentor}
                    </span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                    {s.stale && (
                      <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        ⚠ 정산 이후 세션 상태가 변경되었습니다
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.status === "pending" && (
                      <button className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                        확정
                      </button>
                    )}
                    {s.status === "confirmed" && (
                      <>
                        <button className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white">
                          지급 완료
                        </button>
                        <button className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600">
                          되돌리기
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-gray-400">진행 시간</p>
                    {s.hours}시간
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">세션 수</p>
                    {s.sessions}회
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">계산액</p>
                    {fmt(s.amount)}원
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">최종 지급액</p>
                    <b>{fmt(finalAmount)}원</b>
                    {s.adjustment != null && (
                      <span className="ml-1 text-xs text-amber-600">
                        (조정 {fmt(s.adjustment)}원 · {s.reason})
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
