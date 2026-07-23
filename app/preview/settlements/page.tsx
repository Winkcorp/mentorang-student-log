"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";

/** 미리보기 — 정산 상태 전환/조정이 로컬 상태로 실제 동작한다. */

const NAV = [
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/calendar", label: "캘린더" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/settlements", label: "정산" },
];

type Status = "pending" | "confirmed" | "paid";

interface Settlement {
  id: number;
  mentor: string;
  status: Status;
  hours: string;
  sessions: number;
  amount: number;
  adjustment: number | null;
  reason: string | null;
  stale: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "확인 대기",
  confirmed: "확정",
  paid: "지급 완료",
};
const STATUS_STYLE: Record<Status, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
};

export default function PreviewSettlementsPage() {
  const [ranMsg, setRanMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Settlement[]>([
    { id: 1, mentor: "박멘토", status: "pending", hours: "24.50", sessions: 14, amount: 612500, adjustment: null, reason: null, stale: false },
    { id: 2, mentor: "최멘토", status: "confirmed", hours: "18.00", sessions: 12, amount: 600000, adjustment: -50000, reason: "교재비 선지급 차감", stale: true },
    { id: 3, mentor: "정멘토", status: "paid", hours: "0.00", sessions: 8, amount: 400000, adjustment: null, reason: null, stale: false },
  ]);
  const [adj, setAdj] = useState<Record<number, { amount: string; reason: string }>>({});

  const fmt = (n: number) => n.toLocaleString();

  function setStatus(id: number, status: Status) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, status, stale: false } : r)));
  }

  function saveAdjust(id: number) {
    const a = adj[id];
    if (!a) return;
    const amount = a.amount === "" ? null : Number(a.amount);
    if (amount !== null && (!Number.isFinite(amount) || !a.reason.trim())) return;
    setRows((list) =>
      list.map((r) =>
        r.id === id
          ? { ...r, adjustment: amount, reason: amount === null ? null : a.reason.trim() }
          : r,
      ),
    );
  }

  return (
    <AppShell title="관리자" nav={NAV} userLabel="admin@mentorang.kr">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">정산</h1>
          <div className="flex items-center gap-2 text-sm">
            <button className="rounded-lg border border-gray-300 px-2 py-1 hover:bg-gray-100">←</button>
            <span className="font-semibold text-gray-900">2026-07</span>
            <button className="rounded-lg border border-gray-300 px-2 py-1 hover:bg-gray-100">→</button>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() =>
              setRanMsg(
                "3명 계산 완료. 같은 기간 재실행 시 pending 정산은 재계산되고, 확정된 정산은 건드리지 않습니다. (최멘토: confirmed 상태라 재계산하지 않음)",
              )
            }
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            2026-07 정산 실행 (활성 멘토 전원)
          </button>
          {ranMsg && <p className="text-sm text-green-700">{ranMsg}</p>}
        </div>

        <ul className="space-y-3">
          {rows.map((s) => {
            const finalAmount = s.amount + (s.adjustment ?? 0);
            const a = adj[s.id] ?? {
              amount: s.adjustment?.toString() ?? "",
              reason: s.reason ?? "",
            };
            return (
              <li key={s.id} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-semibold text-gray-900">{s.mentor}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>
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
                      <button
                        onClick={() => setStatus(s.id, "confirmed")}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        확정
                      </button>
                    )}
                    {s.status === "confirmed" && (
                      <>
                        <button
                          onClick={() => setStatus(s.id, "paid")}
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                        >
                          지급 완료
                        </button>
                        <button
                          onClick={() => setStatus(s.id, "pending")}
                          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
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

                {s.status !== "paid" && (
                  <details>
                    <summary className="cursor-pointer text-xs text-gray-500 hover:underline">
                      수동 조정
                    </summary>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          조정액 (음수 가능, 비우면 해제)
                        </label>
                        <input
                          type="number"
                          value={a.amount}
                          onChange={(e) => setAdj({ ...adj, [s.id]: { ...a, amount: e.target.value } })}
                          className="w-36 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">사유 (조정 시 필수)</label>
                        <input
                          value={a.reason}
                          onChange={(e) => setAdj({ ...adj, [s.id]: { ...a, reason: e.target.value } })}
                          className="w-52 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => saveAdjust(s.id)}
                        className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                      >
                        저장
                      </button>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
