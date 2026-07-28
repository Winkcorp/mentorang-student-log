"use client";

import { useState, useTransition } from "react";
import {
  bulkUpdateSessionStatus,
  createMakeupSession,
  updateSessionProgress,
  updateSessionStatus,
} from "./actions";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  no_show: "bg-red-50 text-red-700",
  canceled: "bg-gray-100 text-gray-500",
  makeup: "bg-purple-50 text-purple-700",
};

/** 한 번의 탭으로 바꿀 수 있는 상태 */
const TAP_STATUSES = ["completed", "no_show", "canceled"] as const;

const inputCls =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";

export interface SessionProgress {
  from: number | null;
  to: number | null;
  total: number | null;
  unitLabel: string | null;
  /** 직전 회차 progress_to에서 온 제안값 */
  suggestedFrom: number | null;
  label: string | null;
}

export interface MentorSessionRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  relatedSessionId: string | null;
  hasMakeup: boolean;
  studentName: string;
  /** 저장하지 않고 서버에서 계산한 제목 */
  title: string;
  /** 진도 관리 유형이 아니면 null */
  progress: SessionProgress | null;
}

export function MentorSessionList({ sessions }: { sessions: MentorSessionRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingBulk, setPendingBulk] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectable = sessions.filter((s) => s.status !== "makeup");
  const allSelected =
    selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s.id)));

  function runBulk(status: string) {
    startTransition(async () => {
      const r = await bulkUpdateSessionStatus([...selected], status);
      setBulkMessage(
        r.error ?? `${r.affected}건을 ${STATUS_LABEL[status]}로 변경했습니다.`,
      );
      if (!r.error) setSelected(new Set());
      setPendingBulk(null);
    });
  }

  return (
    <div className="space-y-3">
      {/* ---- 벌크 툴바 ------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={!selectable.length}
          />
          전체 선택
        </label>

        <span className="text-sm text-gray-500">{selected.size}건 선택</span>

        {selected.size > 0 && !pendingBulk && (
          <div className="flex flex-wrap gap-1">
            {TAP_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setBulkMessage(null);
                  setPendingBulk(st);
                }}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                {STATUS_LABEL[st]}로 일괄 변경
              </button>
            ))}
          </div>
        )}

        {pendingBulk && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5">
            <span className="text-xs text-amber-900">
              <b>{selected.size}건</b>이 {STATUS_LABEL[pendingBulk]}로
              변경됩니다.
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => runBulk(pendingBulk)}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {isPending ? "변경 중..." : "실행"}
            </button>
            <button
              type="button"
              onClick={() => setPendingBulk(null)}
              className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
            >
              취소
            </button>
          </div>
        )}

        {bulkMessage && (
          <span className="text-xs text-gray-600">{bulkMessage}</span>
        )}
      </div>

      {/* ---- 세션 목록 ------------------------------------------------ */}
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-start gap-3 text-sm text-gray-900">
                {s.status !== "makeup" ? (
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="mt-1"
                    aria-label={`${s.title} 선택`}
                  />
                ) : (
                  <span className="w-[13px]" />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.title}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                    {s.relatedSessionId && (
                      <span className="text-xs text-gray-400">
                        (원 세션 연결됨)
                      </span>
                    )}
                    {s.hasMakeup && (
                      <span className="text-xs text-purple-500">
                        대체수업 있음
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {s.date} {s.startTime}~{s.endTime}
                    {s.progress?.label && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                        진도 {s.progress.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {s.status !== "makeup" && (
                <div className="flex items-center gap-1">
                  {TAP_STATUSES.filter((st) => st !== s.status).map((st) => (
                    <form key={st} action={updateSessionStatus}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value={st} />
                      <button
                        type="submit"
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        {STATUS_LABEL[st]}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>

            {/* ---- 진도 입력 (진도 관리 유형만) ---------------------- */}
            {s.progress && <ProgressForm sessionId={s.id} progress={s.progress} />}

            {/* ---- 대체수업 ---------------------------------------- */}
            {s.status === "canceled" && !s.hasMakeup && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-purple-600 hover:underline">
                  대체수업 만들기
                </summary>
                <form
                  action={createMakeupSession}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="originalId" value={s.id} />
                  <input name="date" type="date" required className={inputCls} />
                  <input
                    name="startTime"
                    type="time"
                    required
                    defaultValue={s.startTime}
                    className={inputCls}
                  />
                  <input
                    name="endTime"
                    type="time"
                    required
                    defaultValue={s.endTime}
                    className={inputCls}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                  >
                    대체수업 등록
                  </button>
                </form>
              </details>
            )}
          </li>
        ))}
        {!sessions.length && (
          <p className="text-sm text-gray-400">기록된 세션이 없습니다.</p>
        )}
      </ul>
    </div>
  );
}

/** 그 회차에 나간 학습 범위 입력 — 시작 진도는 직전 회차 종료 진도를 제안 */
function ProgressForm({
  sessionId,
  progress,
}: {
  sessionId: string;
  progress: SessionProgress;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const unit = progress.unitLabel ?? "";
  const defaultFrom = progress.from ?? progress.suggestedFrom ?? "";

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const r = await updateSessionProgress(formData);
          setError(r.error);
          setSaved(!r.error);
        });
      }}
      className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2"
    >
      <input type="hidden" name="id" value={sessionId} />
      <span className="text-xs text-gray-500">진도</span>
      <input
        name="progressFrom"
        type="number"
        defaultValue={defaultFrom}
        placeholder="시작"
        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />
      <span className="text-xs text-gray-400">~</span>
      <input
        name="progressTo"
        type="number"
        defaultValue={progress.to ?? ""}
        placeholder="종료"
        className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none"
      />
      {unit && <span className="text-xs text-gray-400">{unit}</span>}
      {progress.total && (
        <span className="text-xs text-gray-400">
          / 총 {progress.total}
          {unit}
        </span>
      )}
      {progress.from == null && progress.suggestedFrom != null && (
        <span className="text-xs text-blue-600">
          직전 회차 이어서 {progress.suggestedFrom}
          {unit} 제안
        </span>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {isPending ? "저장 중..." : "진도 저장"}
      </button>
      {saved && <span className="text-xs text-green-600">저장됨</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
