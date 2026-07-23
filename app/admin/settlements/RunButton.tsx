"use client";

import { useState, useTransition } from "react";
import { runMonthlySettlements, type RunResult } from "./actions";

export function RunButton({ ym }: { ym: string }) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setResult(await runMonthlySettlements(ym));
          })
        }
        className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isPending ? "정산 중..." : `${ym} 정산 실행 (활성 멘토 전원)`}
      </button>
      {result && (
        <div className="text-sm">
          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <>
              <p className="text-green-700">
                {result.processed}명 계산 완료.{" "}
                <span className="text-gray-500">
                  같은 기간 재실행 시 pending 정산은 재계산되고, 확정된 정산은
                  건드리지 않습니다.
                </span>
              </p>
              {result.skipped!.length > 0 && (
                <ul className="mt-1 text-xs text-amber-700">
                  {result.skipped!.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
