"use client";

import { useState } from "react";
import { weekdayLabel } from "@/lib/dates";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_STYLE,
  type OpsOptions,
  type OpsRow,
} from "./types";

type SortKey =
  | "date"
  | "startTime"
  | "studentName"
  | "mentorName"
  | "roomId"
  | "sessionTypeId"
  | "status";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "date", label: "날짜" },
  { key: "startTime", label: "시간" },
  { key: "studentName", label: "학생" },
  { key: "mentorName", label: "멘토" },
  { key: "roomId", label: "공간" },
  { key: "sessionTypeId", label: "유형" },
  { key: "status", label: "상태" },
];

const cellInput =
  "w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-gray-300 focus:border-gray-400 focus:bg-white focus:outline-none";

/**
 * 기본 표 뷰. 주간 그리드를 재현하지 않는다 — 세션이 몰려도 행이 겹치지 않고,
 * 각 행에서 모달 없이 바로 편집한다.
 */
export function TableView({
  rows,
  options,
  selected,
  onToggle,
  onToggleAll,
  onPatch,
  busy,
}: {
  rows: OpsRow[];
  options: OpsOptions;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<
        OpsRow,
        "date" | "startTime" | "endTime" | "mentorId" | "roomId" | "status"
      >
    >,
  ) => void;
  busy: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [asc, setAsc] = useState(true);

  const roomName = (id: string | null) =>
    id ? (options.rooms.find((r) => r.id === id)?.name ?? "") : "";
  const typeName = (id: string | null) =>
    id ? (options.sessionTypes.find((t) => t.id === id)?.name ?? "") : "";

  const sorted = [...rows].sort((a, b) => {
    const dir = asc ? 1 : -1;
    switch (sortKey) {
      case "roomId":
        return roomName(a.roomId).localeCompare(roomName(b.roomId)) * dir;
      case "sessionTypeId":
        return typeName(a.sessionTypeId).localeCompare(typeName(b.sessionTypeId)) * dir;
      case "status":
        return (
          (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * dir
        );
      case "date":
        // 같은 날짜면 시작 시각으로 2차 정렬
        return (
          (a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime)) * dir
        );
      default:
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir;
    }
  });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200/70 bg-white">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
          <tr>
            <th className="w-8 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="전체 선택"
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => {
                    if (sortKey === c.key) setAsc(!asc);
                    else {
                      setSortKey(c.key);
                      setAsc(true);
                    }
                  }}
                  className="flex items-center gap-1 hover:text-gray-900"
                >
                  {c.label}
                  {sortKey === c.key && <span>{asc ? "▲" : "▼"}</span>}
                </button>
              </th>
            ))}
            <th className="px-3 py-2 font-medium">제목 (계산됨)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((r) => (
            <tr
              key={r.id}
              className={selected.has(r.id) ? "bg-blue-50/50" : undefined}
            >
              <td className="px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => onToggle(r.id)}
                  aria-label={`${r.title} 선택`}
                />
              </td>

              <td className="px-3 py-1.5">
                <input
                  type="date"
                  defaultValue={r.date}
                  disabled={busy}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== r.date) {
                      onPatch(r.id, { date: e.target.value });
                    }
                  }}
                  className={cellInput}
                />
                <span className="ml-1 text-gray-400">
                  {weekdayLabel(r.date)}
                </span>
              </td>

              <td className="whitespace-nowrap px-3 py-1.5">
                <input
                  type="time"
                  defaultValue={r.startTime}
                  disabled={busy}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== r.startTime) {
                      onPatch(r.id, { startTime: e.target.value });
                    }
                  }}
                  className={`${cellInput} inline w-[74px]`}
                />
                <span className="text-gray-400">~</span>
                <input
                  type="time"
                  defaultValue={r.endTime}
                  disabled={busy}
                  onBlur={(e) => {
                    if (e.target.value && e.target.value !== r.endTime) {
                      onPatch(r.id, { endTime: e.target.value });
                    }
                  }}
                  className={`${cellInput} inline w-[74px]`}
                />
              </td>

              <td className="px-3 py-1.5 text-gray-900">{r.studentName}</td>

              <td className="px-3 py-1.5">
                <select
                  value={r.mentorId}
                  disabled={busy}
                  onChange={(e) => onPatch(r.id, { mentorId: e.target.value })}
                  className={cellInput}
                >
                  {options.mentors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-3 py-1.5">
                <select
                  value={r.roomId ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    onPatch(r.id, { roomId: e.target.value || null })
                  }
                  className={cellInput}
                >
                  <option value="">미지정</option>
                  {options.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-3 py-1.5 text-gray-600">
                {typeName(r.sessionTypeId) || "-"}
              </td>

              <td className="px-3 py-1.5">
                <select
                  value={r.status}
                  disabled={busy}
                  onChange={(e) => onPatch(r.id, { status: e.target.value })}
                  className={`${cellInput} rounded-full font-medium ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-3 py-1.5 text-gray-500">{r.title}</td>
            </tr>
          ))}
          {!sorted.length && (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                조건에 맞는 세션이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
