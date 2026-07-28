"use client";

import { useState, useTransition } from "react";
import type { Conflict } from "@/lib/sessions/conflicts";
import type { Room } from "@/lib/masters/types";
import { deleteSeriesSessions, updateSeriesSessions } from "../actions";
import { SCOPE_LABEL, SCOPES, type EditScope } from "../scope";

const inputCls =
  "rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-gray-400 focus:outline-none";

/**
 * 회차 수정·삭제 — 항상 "이 회차만 / 이 회차 이후 전체 / 전체 시리즈" 3택.
 *
 * 확정된 과거 세션(완료·노쇼)은 서버에서 제외되고, 몇 건이 제외됐는지
 * 결과에 표시된다.
 */
export function SessionRowActions({
  seriesId,
  sessionId,
  startTime,
  endTime,
  roomId,
  rooms,
  locked,
}: {
  seriesId: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  rooms: Room[];
  /** 이 회차 자체가 확정 상태면 조작 불가 */
  locked: boolean;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [scope, setScope] = useState<EditScope>("single");
  const [newStart, setNewStart] = useState(startTime.slice(0, 5));
  const [newEnd, setNewEnd] = useState(endTime.slice(0, 5));
  const [newRoom, setNewRoom] = useState(roomId ?? "");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (locked) {
    return (
      <span className="text-xs text-gray-400">확정 회차 — 변경 불가</span>
    );
  }

  const close = () => {
    setMode(null);
    setConflicts([]);
    setAcknowledged(false);
    setError(null);
  };

  function submitEdit() {
    startTransition(async () => {
      const r = await updateSeriesSessions(
        seriesId,
        sessionId,
        scope,
        {
          startTime: newStart,
          endTime: newEnd,
          roomId: newRoom || null,
        },
        { acknowledgeConflicts: acknowledged },
      );

      if (r.conflicts?.length) {
        setConflicts(r.conflicts);
        setError(null);
        return;
      }
      if (r.error) {
        setError(r.error);
        return;
      }
      setMessage(
        `${r.affected}건 변경${r.locked ? ` (확정 ${r.locked}건 제외)` : ""}`,
      );
      close();
    });
  }

  function submitDelete() {
    startTransition(async () => {
      const r = await deleteSeriesSessions(seriesId, sessionId, scope);
      if (r.error) {
        setError(r.error);
        return;
      }
      setMessage(
        `${r.affected}건 삭제${r.locked ? ` (확정 ${r.locked}건 제외)` : ""}`,
      );
      close();
    });
  }

  if (message) {
    return <span className="text-xs text-green-600">{message}</span>;
  }

  if (!mode) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => setMode("delete")}
          className="text-xs text-gray-400 hover:text-red-500 hover:underline"
        >
          삭제
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-gray-300 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-700">
        {mode === "edit" ? "회차 수정" : "회차 삭제"} — 적용 범위를 고르세요
      </p>

      <div className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <label
            key={s}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs ${
              scope === s
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <input
              type="radio"
              name={`scope-${sessionId}`}
              value={s}
              checked={scope === s}
              onChange={() => {
                setScope(s);
                setConflicts([]);
                setAcknowledged(false);
              }}
              className="sr-only"
            />
            {SCOPE_LABEL[s]}
          </label>
        ))}
      </div>

      {mode === "edit" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            value={newStart}
            onChange={(e) => {
              setNewStart(e.target.value);
              setConflicts([]);
              setAcknowledged(false);
            }}
            className={inputCls}
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="time"
            value={newEnd}
            onChange={(e) => {
              setNewEnd(e.target.value);
              setConflicts([]);
              setAcknowledged(false);
            }}
            className={inputCls}
          />
          <select
            value={newRoom}
            onChange={(e) => {
              setNewRoom(e.target.value);
              setConflicts([]);
              setAcknowledged(false);
            }}
            className={inputCls}
          >
            <option value="">공간 미지정</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "delete" && (
        <p className="text-xs text-gray-600">
          하드 삭제가 아니라 소프트 삭제(deleted_at)로 처리됩니다. 확정된 과거
          회차(완료·노쇼)는 제외됩니다.
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2">
          <p className="text-xs font-medium text-red-800">
            충돌 {conflicts.length}건
          </p>
          <ul className="space-y-0.5 text-[11px] text-red-700">
            {conflicts.map((c, i) => (
              <li key={`${c.date}-${c.kind}-${i}`}>• {c.message}</li>
            ))}
          </ul>
          <label className="flex items-start gap-1.5 text-[11px] text-red-800">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>충돌을 확인했고, 그대로 적용합니다.</span>
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={
            isPending || (conflicts.length > 0 && !acknowledged && mode === "edit")
          }
          onClick={mode === "edit" ? submitEdit : submitDelete}
          className={`rounded-lg px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
            mode === "edit"
              ? "bg-gray-900 hover:bg-gray-700"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {isPending
            ? "처리 중..."
            : `${SCOPE_LABEL[scope]} ${mode === "edit" ? "수정" : "삭제"}`}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          취소
        </button>
      </div>
    </div>
  );
}
