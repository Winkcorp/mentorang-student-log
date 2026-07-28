"use client";

import { useState } from "react";
import { FALLBACK_SUBJECT_COLOR } from "@/lib/masters/types";
import {
  STATUS_LABEL,
  toMinutes,
  toTime,
  type OpsOptions,
  type OpsRow,
} from "./types";

/** 30분 단위 격자, 1분 = 0.8px */
const SLOT_MINUTES = 30;
const PX_PER_MIN = 0.8;
const SLOT_HEIGHT = SLOT_MINUTES * PX_PER_MIN;

export type ResourceAxis = "room" | "mentor";

interface Lane {
  row: OpsRow;
  lane: number;
}

/**
 * 겹치는 세션을 같은 자리에 포개지 않고 나란히 두기 위한 레인 배치.
 * 시작 시각 순으로 훑으면서 비어있는 첫 레인에 넣는다.
 */
function assignLanes(rows: OpsRow[]): { lanes: Lane[]; laneCount: number } {
  const sorted = [...rows].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime),
  );
  const laneEnds: number[] = [];
  const lanes: Lane[] = [];

  for (const row of sorted) {
    const start = toMinutes(row.startTime);
    const end = toMinutes(row.endTime);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.push({ row, lane });
  }

  return { lanes, laneCount: Math.max(1, laneEnds.length) };
}

/**
 * 일간 리소스 뷰 — 가로축은 공간(또는 멘토), 세로축은 시간.
 * 드래그로 옮기면 놓는 순간 충돌 검사를 돌리고, 충돌이면 되돌린다.
 */
export function ResourceView({
  rows,
  options,
  axis,
  onMove,
  busy,
}: {
  rows: OpsRow[];
  options: OpsOptions;
  axis: ResourceAxis;
  onMove: (
    id: string,
    patch: {
      startTime: string;
      endTime: string;
      roomId?: string | null;
      mentorId?: string;
    },
  ) => void;
  busy: boolean;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const subjectColor = (id: string | null) =>
    (id ? options.subjects.find((s) => s.id === id)?.color : null) ??
    FALLBACK_SUBJECT_COLOR;

  // 컬럼 정의 — display_order 순서를 그대로 쓴다
  const columns =
    axis === "room"
      ? [
          ...options.rooms.map((r) => ({ key: r.id, label: r.name })),
          { key: "", label: "공간 미지정" },
        ]
      : options.mentors.map((m) => ({ key: m.id, label: m.name }));

  // 표시 시간 범위 — 세션이 없으면 기본 16~22시
  const starts = rows.map((r) => toMinutes(r.startTime));
  const ends = rows.map((r) => toMinutes(r.endTime));
  const rangeStart = rows.length
    ? Math.floor((Math.min(...starts) - 30) / 60) * 60
    : 16 * 60;
  const rangeEnd = rows.length
    ? Math.ceil((Math.max(...ends) + 30) / 60) * 60
    : 22 * 60;

  const slotCount = Math.max(1, (rangeEnd - rangeStart) / SLOT_MINUTES);
  const slots = Array.from(
    { length: slotCount },
    (_, i) => rangeStart + i * SLOT_MINUTES,
  );

  const gridHeight = slotCount * SLOT_HEIGHT;

  function handleDrop(columnKey: string, minutes: number) {
    if (!draggingId) return;
    const row = rows.find((r) => r.id === draggingId);
    setDraggingId(null);
    if (!row) return;

    const duration = toMinutes(row.endTime) - toMinutes(row.startTime);
    const startTime = toTime(minutes);
    const endTime = toTime(minutes + duration);

    const sameColumn =
      axis === "room"
        ? (row.roomId ?? "") === columnKey
        : row.mentorId === columnKey;

    if (sameColumn && startTime === row.startTime) return;

    onMove(row.id, {
      startTime,
      endTime,
      ...(axis === "room"
        ? { roomId: columnKey || null }
        : { mentorId: columnKey }),
    });
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/70 bg-white p-3">
      <div className="flex min-w-[720px]">
        {/* 시간 눈금 */}
        <div className="w-14 shrink-0">
          <div className="h-7" />
          <div className="relative" style={{ height: gridHeight }}>
            {slots.map((m, i) => (
              <div
                key={m}
                className="absolute left-0 w-full pr-2 text-right text-[10px] text-gray-400"
                style={{ top: i * SLOT_HEIGHT - 5 }}
              >
                {m % 60 === 0 ? toTime(m) : ""}
              </div>
            ))}
          </div>
        </div>

        {/* 리소스 컬럼 */}
        {columns.map((col) => {
          const columnRows = rows.filter((r) =>
            axis === "room" ? (r.roomId ?? "") === col.key : r.mentorId === col.key,
          );
          const { lanes, laneCount } = assignLanes(columnRows);

          return (
            <div key={col.key || "none"} className="min-w-[120px] flex-1 px-0.5">
              <div className="flex h-7 items-center justify-center truncate rounded-t-lg bg-gray-50 text-xs font-medium text-gray-700">
                {col.label}
                {columnRows.length > 0 && (
                  <span className="ml-1 text-gray-400">
                    ({columnRows.length})
                  </span>
                )}
              </div>

              <div
                className="relative border-l border-gray-100"
                style={{ height: gridHeight }}
              >
                {/* 드롭 대상 격자 */}
                {slots.map((m, i) => (
                  <div
                    key={m}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(col.key, m)}
                    className={`absolute w-full ${
                      m % 60 === 0
                        ? "border-t border-gray-200"
                        : "border-t border-dashed border-gray-100"
                    } ${draggingId ? "hover:bg-blue-50" : ""}`}
                    style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                  />
                ))}

                {/* 세션 블록 */}
                {lanes.map(({ row, lane }) => {
                  const top = (toMinutes(row.startTime) - rangeStart) * PX_PER_MIN;
                  const height = Math.max(
                    18,
                    (toMinutes(row.endTime) - toMinutes(row.startTime)) *
                      PX_PER_MIN,
                  );
                  const widthPct = 100 / laneCount;

                  return (
                    <div
                      key={row.id}
                      draggable={!busy}
                      onDragStart={(e) => {
                        setDraggingId(row.id);
                        // Firefox는 dataTransfer에 뭔가 담겨야 드래그를 시작한다
                        e.dataTransfer.setData("text/plain", row.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      title={`${row.title}\n${row.startTime}~${row.endTime} · ${STATUS_LABEL[row.status]}`}
                      className={`absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight text-white shadow-sm ${
                        busy ? "cursor-wait" : "cursor-grab"
                      } ${draggingId ? "pointer-events-none" : ""} ${
                        draggingId === row.id ? "opacity-40" : ""
                      } ${row.status === "canceled" ? "opacity-50" : ""}`}
                      style={{
                        top,
                        height,
                        left: `${lane * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                        backgroundColor: subjectColor(row.subjectId),
                      }}
                    >
                      <div className="truncate font-semibold">
                        {row.studentName}
                      </div>
                      <div className="truncate opacity-90">
                        {row.startTime}
                        {axis === "room" ? ` ${row.mentorName}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        블록을 끌어 시간·{axis === "room" ? "공간" : "멘토"}을 옮길 수 있습니다
        (30분 단위). 놓는 순간 충돌 검사를 돌려 충돌이면 되돌립니다.
      </p>
    </div>
  );
}
