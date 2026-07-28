"use client";

import { useState, useTransition } from "react";
import { confirmAssignment, type ConfirmResult } from "./actions";

/**
 * 후보 → 확정 전환.
 *
 * 같은 조합에 이미 확정된 배정이 있으면 DB partial unique index에 걸린다.
 * 그 에러를 그대로 보여주지 않고, 기존 배정을 알려주며 교체할지 물어본다.
 */
export function ConfirmButton({ assignmentId }: { assignmentId: string }) {
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (replace: boolean) => {
    startTransition(async () => {
      const r = await confirmAssignment(assignmentId, replace);
      setResult(r.ok ? null : r);
    });
  };

  if (result?.conflict) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <p className="text-amber-900">
          이미 확정된 배정이 있습니다 —{" "}
          <b>{result.conflict.mentorName}</b> ({result.conflict.startDate}~).
        </p>
        <p className="mt-1 text-xs text-amber-700">
          교체하면 기존 배정은 종료(ended) 처리됩니다.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(true)}
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isPending ? "교체 중..." : "교체하고 확정"}
          </button>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-800 hover:bg-amber-100"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(false)}
        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isPending ? "확정 중..." : "확정"}
      </button>
      {result?.error && (
        <p className="mt-1 text-xs text-red-600">{result.error}</p>
      )}
    </div>
  );
}
