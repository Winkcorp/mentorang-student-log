"use client";

import { useState, useTransition } from "react";
import { updateCandidateMemo } from "./actions";

/** 후보 검토 메모 인라인 수정 */
export function MemoForm({
  assignmentId,
  memo,
}: {
  assignmentId: string;
  memo: string | null;
}) {
  const [value, setValue] = useState(memo ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = value !== (memo ?? "");

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="검토 메모"
        className="w-64 rounded-xl border border-gray-200 px-3 py-1.5 text-xs focus:border-gray-400 focus:outline-none"
      />
      {dirty && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.set("id", assignmentId);
              fd.set("memo", value);
              const r = await updateCandidateMemo(fd);
              setError(r.error);
              setSaved(!r.error);
            });
          }}
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "저장"}
        </button>
      )}
      {saved && <span className="text-xs text-green-600">저장됨</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
