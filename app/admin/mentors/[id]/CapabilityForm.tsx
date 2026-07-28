"use client";

import { useState, useTransition } from "react";
import type { SessionType, Subject } from "@/lib/masters/types";
import { addCapability } from "./actions";

const inputCls =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-gray-500";

/**
 * 담당 자격 추가 — 세션유형을 고르면 그 유형이 과목을 요구하는지에 따라
 * 과목 선택이 나타난다(과목 무관 유형은 아예 감춘다).
 */
export function CapabilityForm({
  mentorId,
  sessionTypes,
  subjects,
}: {
  mentorId: string;
  sessionTypes: SessionType[];
  subjects: Subject[];
}) {
  const [sessionTypeId, setSessionTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = sessionTypes.find((t) => t.id === sessionTypeId);
  const needsSubject = selected?.requires_subject ?? false;

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await addCapability(formData);
          setError(result.error);
          if (!result.error) setSessionTypeId("");
        });
      }}
      className="space-y-3 rounded-2xl border border-gray-200/70 bg-white p-4"
    >
      <input type="hidden" name="mentorId" value={mentorId} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>세션유형 *</label>
          <select
            name="sessionTypeId"
            value={sessionTypeId}
            onChange={(e) => {
              setSessionTypeId(e.target.value);
              setError(null);
            }}
            required
            className={inputCls}
          >
            <option value="">선택</option>
            {sessionTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.requires_subject ? "" : " (과목 무관)"}
              </option>
            ))}
          </select>
        </div>

        {needsSubject && (
          <div>
            <label className={labelCls}>과목 *</label>
            <select name="subjectId" required className={inputCls}>
              <option value="">선택</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !sessionTypeId}
          className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isPending ? "추가 중..." : "자격 추가"}
        </button>
      </div>

      {selected && !needsSubject && (
        <p className="text-xs text-gray-500">
          &quot;{selected.name}&quot;은 과목 무관 유형이라 과목을 비워 등록합니다.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
