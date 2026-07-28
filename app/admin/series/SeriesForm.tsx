"use client";

import { useState, useTransition } from "react";
import { WEEKDAY_LABELS } from "@/lib/dates";
import type { Room, TimeSlot } from "@/lib/masters/types";
import {
  checkSeries,
  createSeries,
  type SeriesApplyResult,
  type SeriesCheckResult,
  type SeriesInput,
} from "./actions";

const inputCls =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-gray-500";

export interface AssignmentOption {
  id: string;
  label: string;
}

/**
 * 시리즈 등록: ① 사전 점검(예외일·충돌) → ② 확인 → ③ 일괄 생성.
 *
 * 시간대를 고르면 default 시각이 채워지되, 그 뒤 수정 가능하다
 * (실제 시각의 정본은 시리즈이므로).
 */
export function SeriesForm({
  assignments,
  timeSlots,
  rooms,
}: {
  assignments: AssignmentOption[];
  timeSlots: TimeSlot[];
  rooms: Room[];
}) {
  const [assignmentId, setAssignmentId] = useState("");
  const [timeSlotId, setTimeSlotId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startDate, setStartDate] = useState("");
  const [totalWeeks, setTotalWeeks] = useState("4");
  const [check, setCheck] = useState<SeriesCheckResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<SeriesApplyResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const input = (): SeriesInput => ({
    assignmentId,
    timeSlotId,
    roomId: roomId || null,
    dayOfWeek: Number(dayOfWeek),
    startTime,
    endTime,
    startDate,
    totalWeeks: Number(totalWeeks),
  });

  const ready =
    assignmentId && timeSlotId && dayOfWeek && startTime && endTime && startDate;

  const invalidate = () => {
    setCheck(null);
    setResult(null);
    setAcknowledged(false);
  };

  /** 시간대 선택 → default 시각 자동 채움 (이후 수정 가능) */
  function pickTimeSlot(id: string) {
    setTimeSlotId(id);
    const slot = timeSlots.find((s) => s.id === id);
    if (slot) {
      setStartTime(slot.default_start_time.slice(0, 5));
      setEndTime(slot.default_end_time.slice(0, 5));
    }
    invalidate();
  }

  function runCheck() {
    startTransition(async () => {
      setResult(null);
      setAcknowledged(false);
      setCheck(await checkSeries(input()));
    });
  }

  function runCreate() {
    startTransition(async () => {
      const r = await createSeries(input(), {
        acknowledgeConflicts: acknowledged,
      });
      setResult(r);
      if (!r.error) setCheck(null);
    });
  }

  const conflicts = check?.conflicts ?? [];
  const blockedByConflicts = conflicts.length > 0 && !acknowledged;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-gray-200/70 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>배정 (확정된 것만) *</label>
            <select
              value={assignmentId}
              onChange={(e) => {
                setAssignmentId(e.target.value);
                invalidate();
              }}
              className={inputCls}
            >
              <option value="">선택</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>시간대 *</label>
            <select
              value={timeSlotId}
              onChange={(e) => pickTimeSlot(e.target.value)}
              className={inputCls}
            >
              <option value="">선택</option>
              {timeSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.default_start_time.slice(0, 5)}~
                  {s.default_end_time.slice(0, 5)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>요일 *</label>
            <select
              value={dayOfWeek}
              onChange={(e) => {
                setDayOfWeek(e.target.value);
                invalidate();
              }}
              className={inputCls}
            >
              <option value="">선택</option>
              {WEEKDAY_LABELS.slice(1).map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>시작 시각 *</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                invalidate();
              }}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>종료 시각 *</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => {
                setEndTime(e.target.value);
                invalidate();
              }}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>공간</label>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                invalidate();
              }}
              className={inputCls}
            >
              <option value="">미지정</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.capacity ? ` (정원 ${r.capacity})` : " (단독)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>시작일 *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                invalidate();
              }}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>총 주차 *</label>
            <input
              type="number"
              min="1"
              value={totalWeeks}
              onChange={(e) => {
                setTotalWeeks(e.target.value);
                invalidate();
              }}
              className={`${inputCls} w-20`}
            />
          </div>

          <button
            type="button"
            disabled={!ready || isPending}
            onClick={runCheck}
            className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isPending ? "점검 중..." : "사전 점검"}
          </button>
        </div>

        {timeSlotId && (
          <p className="text-xs text-gray-400">
            시간대의 기본 시각이 채워졌습니다 — 필요하면 수정하세요. 실제 시각은
            시리즈에 저장됩니다.
          </p>
        )}
      </div>

      {check?.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {check.error}
        </div>
      )}

      {check && !check.error && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-gray-800">
            {check.studentName} ← {check.mentorName} — 세션{" "}
            <b>{check.planned?.length ?? 0}개</b> 생성
            {check.skipped?.length ? (
              <>
                , <b>{check.skipped.length}개</b> 건너뜀
              </>
            ) : null}
          </p>

          {check.skipped?.length ? (
            <div className="text-xs text-amber-800">
              예외일정과 겹쳐 건너뜁니다:{" "}
              {check.skipped
                .map((o) => `${o.weekNumber}주차(${o.date})`)
                .join(", ")}
            </div>
          ) : null}

          {conflicts.length > 0 && (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                충돌 {conflicts.length}건
              </p>
              <ul className="space-y-1 text-xs text-red-700">
                {conflicts.map((c, i) => (
                  <li key={`${c.date}-${c.kind}-${i}`}>• {c.message}</li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-xs text-red-800">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  충돌을 확인했고, 그대로 생성합니다.
                </span>
              </label>
            </div>
          )}

          <button
            type="button"
            disabled={isPending || blockedByConflicts}
            onClick={runCreate}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isPending
              ? "생성 중..."
              : blockedByConflicts
                ? "충돌 확인 필요"
                : "시리즈 생성"}
          </button>
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {result.error ??
            `시리즈 생성 완료 — 세션 ${result.createdCount}개 생성${
              result.skippedCount ? `, ${result.skippedCount}개 건너뜀` : ""
            }`}
        </div>
      )}
    </div>
  );
}
