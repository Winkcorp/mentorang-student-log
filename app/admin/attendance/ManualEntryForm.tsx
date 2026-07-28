"use client";

import { useState, useTransition } from "react";
import { ATTENDANCE_LABEL } from "@/lib/attendance/derive";
import { setManualAttendance } from "./actions";

const OPTIONS = ["present", "partial", "absent"] as const;

/**
 * 수동 출결 입력 — 세션이 없는 날에만 렌더된다.
 * (세션이 있는 날은 부모가 이 컴포넌트를 아예 그리지 않는다)
 */
export function ManualEntryForm({
  studentId,
  date,
  current,
  currentReason,
}: {
  studentId: string;
  date: string;
  current: string | null;
  currentReason: string | null;
}) {
  const [status, setStatus] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const r = await setManualAttendance(formData);
          setError(r.error);
          setSaved(!r.error);
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="date" value={date} />

      <select
        name="status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setSaved(false);
        }}
        required
        className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      >
        <option value="">수동 입력…</option>
        {OPTIONS.map((o) => (
          <option key={o} value={o}>
            {ATTENDANCE_LABEL[o]}
          </option>
        ))}
      </select>

      <input
        name="reason"
        defaultValue={currentReason ?? ""}
        placeholder="사유 (선택)"
        className="w-40 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />

      <button
        type="submit"
        disabled={isPending || !status}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {isPending ? "저장 중..." : "저장"}
      </button>

      {saved && <span className="text-xs text-green-600">저장됨</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
