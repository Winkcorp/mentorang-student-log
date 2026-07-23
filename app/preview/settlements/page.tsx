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

interface WorkRow {
  date: string;
  student: string;
  time: string;
  status: string;
  hours: string;
  counted: boolean;
  note?: string;
}

const WORK_LOG: Record<number, { rows: WorkRow[]; formula: string }> = {
  1: {
    rows: [
      { date: "07-01", student: "김학생", time: "19:00~21:00", status: "완료", hours: "2.0h", counted: true },
      { date: "07-02", student: "이학생", time: "21:00~22:30", status: "완료", hours: "1.5h", counted: true },
      { date: "07-03", student: "김학생", time: "19:00~21:00", status: "노쇼", hours: "2.0h", counted: true, note: "학생 귀책 — 정산 포함(기본값)" },
      { date: "07-08", student: "이학생", time: "21:00~22:30", status: "취소", hours: "―", counted: false, note: "멘토 귀책 취소" },
      { date: "07-09", student: "이학생", time: "21:00~22:30", status: "대체수업", hours: "1.5h", counted: true, note: "07-08 취소분 대체" },
    ],
    formula: "24.5시간 × 25,000원 = 612,500원",
  },
  2: {
    rows: [
      { date: "07-01", student: "박학생", time: "19:00~20:30", status: "완료", hours: "1.5h", counted: true },
      { date: "07-15", student: "박학생", time: "19:00~20:30", status: "완료", hours: "1.5h", counted: true },
    ],
    formula: "12회 × 50,000원 = 600,000원 · 조정 -50,000원(교재비 선지급 차감)",
  },
  3: {
    rows: [
      { date: "07-05", student: "최학생", time: "10:00~12:00", status: "완료", hours: "2.0h", counted: true },
    ],
    formula: "기간 고정액 400,000원 (세션 수 무관)",
  },
};

export default function PreviewSettlementsPage() {
  const [ranMsg, setRanMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
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
                    <button
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                      className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                      title="근무 내역·계산 과정 보기"
                    >
                      {s.mentor} {expanded === s.id ? "▾" : "▸"}
                    </button>
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

                {expanded === s.id && WORK_LOG[s.id] && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      근무 내역 · 계산 과정
                    </p>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                          <th className="pb-1 pr-2 font-semibold">날짜</th>
                          <th className="pb-1 pr-2 font-semibold">학생</th>
                          <th className="pb-1 pr-2 font-semibold">시간</th>
                          <th className="pb-1 pr-2 font-semibold">상태</th>
                          <th className="pb-1 pr-2 text-right font-semibold">진행</th>
                          <th className="pb-1 text-right font-semibold">집계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WORK_LOG[s.id].rows.map((w, i) => (
                          <tr key={i} className={w.counted ? "text-gray-700" : "text-gray-300"}>
                            <td className="py-1 pr-2">{w.date}</td>
                            <td className="py-1 pr-2">{w.student}</td>
                            <td className="py-1 pr-2">{w.time}</td>
                            <td className="py-1 pr-2">
                              {w.status}
                              {w.note && (
                                <span className="ml-1 text-[10px] text-gray-400">({w.note})</span>
                              )}
                            </td>
                            <td className="py-1 pr-2 text-right">{w.hours}</td>
                            <td className="py-1 text-right">
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  w.counted ? "bg-emerald-50 text-emerald-600" : "bg-gray-100"
                                }`}
                              >
                                {w.counted ? "포함" : "제외"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
                      계산: <b>{WORK_LOG[s.id].formula}</b>
                    </p>
                  </div>
                )}

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
