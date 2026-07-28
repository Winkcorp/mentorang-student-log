"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Conflict } from "@/lib/sessions/conflicts";
import {
  bulkEditSessions,
  moveSession,
  softDeleteSessions,
  undoDeleteSessions,
} from "./actions";
import { ResourceView, type ResourceAxis } from "./ResourceView";
import { TableView } from "./TableView";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type OpsOptions,
  type OpsRow,
} from "./types";

type FilterKey =
  | "mentorId"
  | "roomId"
  | "studentId"
  | "sessionTypeId"
  | "timeSlotId"
  | "status";

/** 실행취소 토스트가 떠 있는 시간 */
const UNDO_MS = 5000;

interface PendingBulk {
  label: string;
  run: () => Promise<void>;
}

export function OperationsBoard({
  initialRows,
  options,
  from,
  to,
}: {
  initialRows: OpsRow[];
  options: OpsOptions;
  from: string;
  to: string;
}) {
  // 낙관적 갱신은 props를 복사하지 않고 override로 덮는다.
  // props(서버 데이터)가 늘 정본이라 effect로 동기화할 필요가 없다.
  const [overrides, setOverrides] = useState<Map<string, Partial<OpsRow>>>(
    new Map(),
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"table" | "resource">("table");
  const [axis, setAxis] = useState<ResourceAxis>("room");
  const [resourceDate, setResourceDate] = useState(
    initialRows[0]?.date ?? from,
  );
  const [filters, setFilters] = useState<Record<FilterKey, Set<string>>>({
    mentorId: new Set(),
    roomId: new Set(),
    studentId: new Set(),
    sessionTypeId: new Set(),
    timeSlotId: new Set(),
    status: new Set(),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = initialRows
    .filter((r) => !hiddenIds.has(r.id))
    .map((r) => {
      const patch = overrides.get(r.id);
      return patch ? { ...r, ...patch } : r;
    });

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // ---- 필터 ------------------------------------------------------------
  function toggleFilter(key: FilterKey, value: string) {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  }

  const matches = (row: OpsRow) =>
    (Object.keys(filters) as FilterKey[]).every((key) => {
      const set = filters[key];
      if (!set.size) return true;
      const value = key === "roomId" ? (row.roomId ?? "") : String(row[key] ?? "");
      return set.has(value);
    });

  const filtered = rows.filter(matches);
  const visible =
    view === "resource"
      ? filtered.filter((r) => r.date === resourceDate)
      : filtered;

  const activeFilters = (Object.keys(filters) as FilterKey[]).flatMap((key) =>
    [...filters[key]].map((value) => ({ key, value })),
  );

  const labelFor = (key: FilterKey, value: string): string => {
    switch (key) {
      case "mentorId":
        return options.mentors.find((m) => m.id === value)?.name ?? value;
      case "studentId":
        return options.students.find((s) => s.id === value)?.name ?? value;
      case "roomId":
        return value
          ? (options.rooms.find((r) => r.id === value)?.name ?? value)
          : "공간 미지정";
      case "sessionTypeId":
        return options.sessionTypes.find((t) => t.id === value)?.name ?? value;
      case "timeSlotId":
        return options.timeSlots.find((t) => t.id === value)?.label ?? value;
      case "status":
        return STATUS_LABEL[value] ?? value;
    }
  };

  const GROUP_LABEL: Record<FilterKey, string> = {
    mentorId: "멘토",
    roomId: "공간",
    studentId: "학생",
    sessionTypeId: "유형",
    timeSlotId: "시간대",
    status: "상태",
  };

  const GROUPS: { key: FilterKey; items: { value: string; label: string }[] }[] =
    [
      {
        key: "mentorId",
        items: options.mentors.map((m) => ({ value: m.id, label: m.name })),
      },
      {
        key: "roomId",
        items: [
          ...options.rooms.map((r) => ({ value: r.id, label: r.name })),
          { value: "", label: "미지정" },
        ],
      },
      {
        key: "studentId",
        items: options.students.map((s) => ({ value: s.id, label: s.name })),
      },
      {
        key: "sessionTypeId",
        items: options.sessionTypes.map((t) => ({ value: t.id, label: t.name })),
      },
      {
        key: "timeSlotId",
        items: options.timeSlots.map((t) => ({ value: t.id, label: t.label })),
      },
      {
        key: "status",
        items: STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
      },
    ];

  // ---- 선택 ------------------------------------------------------------
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      visible.every((r) => prev.has(r.id))
        ? new Set()
        : new Set(visible.map((r) => r.id)),
    );

  // ---- 단일 수정 (표 인라인 / 리소스 드래그 공용) -----------------------
  function patchRow(id: string, patch: Partial<OpsRow>) {
    setConflicts([]);
    setError(null);

    // 낙관적 갱신 — 실패하면 이 override를 걷어내 원위치로 되돌린다
    const previous = overrides.get(id);
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...prev.get(id), ...patch });
      return next;
    });

    const revert = () =>
      setOverrides((prev) => {
        const next = new Map(prev);
        if (previous) next.set(id, previous);
        else next.delete(id);
        return next;
      });

    startTransition(async () => {
      const r = await moveSession(id, {
        date: patch.date,
        startTime: patch.startTime,
        endTime: patch.endTime,
        mentorId: patch.mentorId,
        roomId: patch.roomId,
        status: patch.status,
      });

      if (r.conflicts?.length || r.error) {
        revert();
        setConflicts(r.conflicts ?? []);
        setError(r.conflicts?.length ? null : (r.error ?? null));
        return;
      }
      setNotice("변경했습니다.");
    });
  }

  // ---- 벌크 ------------------------------------------------------------
  function askBulk(label: string, run: () => Promise<void>) {
    setConflicts([]);
    setError(null);
    setPendingBulk({ label, run });
  }

  function runBulkEdit(
    patch: Parameters<typeof bulkEditSessions>[1],
    acknowledge = false,
  ) {
    return async () => {
      const ids = [...selected];
      const r = await bulkEditSessions(ids, patch, {
        acknowledgeConflicts: acknowledge,
      });

      if (r.conflicts?.length) {
        setConflicts(r.conflicts);
        // 확인 후 강행할 수 있도록 같은 작업을 acknowledge=true로 다시 제안
        setPendingBulk({
          label: `충돌 ${r.conflicts.length}건을 확인했고 그대로 적용`,
          run: runBulkEdit(patch, true),
        });
        return;
      }
      if (r.error) {
        setError(r.error);
        setPendingBulk(null);
        return;
      }
      setNotice(`${r.affected}건을 변경했습니다.`);
      setSelected(new Set());
      setPendingBulk(null);
    };
  }

  function runDelete() {
    return async () => {
      const ids = [...selected];
      const r = await softDeleteSessions(ids);
      if (r.error) {
        setError(r.error);
        setPendingBulk(null);
        return;
      }
      setHiddenIds((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      setPendingBulk(null);
      setNotice(null);

      // 5초 실행취소
      setUndoIds(ids);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoIds(null), UNDO_MS);
    };
  }

  function undo() {
    const ids = undoIds;
    if (!ids) return;
    setUndoIds(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    startTransition(async () => {
      const r = await undoDeleteSessions(ids);
      if (r.error) {
        setError(r.error);
        return;
      }
      // 다시 보이게 — revalidate된 서버 데이터에도 되살아나 있다
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setNotice(`${r.affected}건을 복구했습니다.`);
    });
  }

  const chipCls = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition ${
      active
        ? "border-gray-900 bg-gray-900 text-white"
        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
    }`;

  const dates = [...new Set(rows.map((r) => r.date))].sort();

  return (
    <div className="space-y-4">
      {/* ---- 기간 + 뷰 전환 ------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              시작
            </label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              종료
            </label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            기간 적용
          </button>
        </form>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-300 p-0.5">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                view === "table" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
            >
              표
            </button>
            <button
              type="button"
              onClick={() => setView("resource")}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                view === "resource" ? "bg-gray-900 text-white" : "text-gray-600"
              }`}
            >
              일간 리소스
            </button>
          </div>

          {view === "resource" && (
            <>
              <select
                value={resourceDate}
                onChange={(e) => setResourceDate(e.target.value)}
                className="rounded-xl border border-gray-200 px-2 py-1.5 text-xs"
              >
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                {!dates.length && <option value={from}>{from}</option>}
              </select>
              <div className="flex rounded-xl border border-gray-300 p-0.5">
                {(["room", "mentor"] as ResourceAxis[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAxis(a)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                      axis === a ? "bg-gray-900 text-white" : "text-gray-600"
                    }`}
                  >
                    {a === "room" ? "공간축" : "멘토축"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- 필터칩 --------------------------------------------------- */}
      <div className="space-y-2 rounded-2xl border border-gray-200/70 bg-white p-3">
        {GROUPS.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1.5">
            <span className="w-12 shrink-0 text-xs font-medium text-gray-400">
              {GROUP_LABEL[g.key]}
            </span>
            {g.items.map((item) => (
              <button
                key={`${g.key}-${item.value}`}
                type="button"
                onClick={() => toggleFilter(g.key, item.value)}
                className={chipCls(filters[g.key].has(item.value))}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}

        {/* 현재 걸린 필터는 항상 보이게 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 text-xs">
          <span className="font-medium text-gray-500">적용된 필터</span>
          {activeFilters.length ? (
            <>
              {activeFilters.map(({ key, value }) => (
                <span
                  key={`${key}-${value}`}
                  className="flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-white"
                >
                  {GROUP_LABEL[key]}: {labelFor(key, value)}
                  <button
                    type="button"
                    onClick={() => toggleFilter(key, value)}
                    aria-label="필터 해제"
                    className="hover:text-red-300"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    mentorId: new Set(),
                    roomId: new Set(),
                    studentId: new Set(),
                    sessionTypeId: new Set(),
                    timeSlotId: new Set(),
                    status: new Set(),
                  })
                }
                className="text-gray-500 underline hover:text-gray-900"
              >
                전체 해제
              </button>
            </>
          ) : (
            <span className="text-gray-400">없음 — 전체 표시</span>
          )}
          <span className="ml-auto text-gray-400">
            {visible.length} / {rows.length}건
          </span>
        </div>
      </div>

      {/* ---- 벌크 편집 ------------------------------------------------ */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-300 bg-gray-50 p-3">
          <span className="text-sm font-medium text-gray-700">
            {selected.size}건 선택
          </span>

          <select
            defaultValue=""
            onChange={(e) => {
              const status = e.target.value;
              e.target.value = "";
              if (!status) return;
              askBulk(
                `${selected.size}건의 상태를 "${STATUS_LABEL[status]}"로 변경`,
                runBulkEdit({ status }),
              );
            }}
            className="rounded-xl border border-gray-200 px-2 py-1.5 text-xs"
          >
            <option value="">상태 변경…</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <select
            defaultValue=""
            onChange={(e) => {
              const mentorId = e.target.value;
              e.target.value = "";
              if (!mentorId) return;
              const name = options.mentors.find((m) => m.id === mentorId)?.name;
              askBulk(
                `${selected.size}건의 멘토를 "${name}"로 변경`,
                runBulkEdit({ mentorId }),
              );
            }}
            className="rounded-xl border border-gray-200 px-2 py-1.5 text-xs"
          >
            <option value="">멘토 변경…</option>
            {options.mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {[-7, -1, 1, 7].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  askBulk(
                    `${selected.size}건을 ${d > 0 ? `+${d}` : d}일 이동`,
                    runBulkEdit({ shiftDays: d }),
                  )
                }
                className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
              >
                {d > 0 ? `+${d}일` : `${d}일`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              askBulk(`${selected.size}건 삭제 (소프트 삭제)`, runDelete())
            }
            className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            삭제
          </button>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-500 underline hover:text-gray-900"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* ---- 실행 확인 ------------------------------------------------ */}
      {pendingBulk && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3">
          <span className="text-sm text-amber-900">
            <b>{pendingBulk.label}</b>합니다. 계속할까요?
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(pendingBulk.run)}
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isPending ? "실행 중..." : "실행"}
          </button>
          <button
            type="button"
            onClick={() => setPendingBulk(null)}
            className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-800 hover:bg-amber-100"
          >
            취소
          </button>
        </div>
      )}

      {/* ---- 충돌 / 오류 / 안내 --------------------------------------- */}
      {conflicts.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-red-800">
              충돌 {conflicts.length}건 — 변경하지 않고 되돌렸습니다
            </p>
            <button
              type="button"
              onClick={() => setConflicts([])}
              className="text-xs text-red-600 hover:underline"
            >
              닫기
            </button>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-red-700">
            {conflicts.map((c, i) => (
              <li key={`${c.date}-${c.kind}-${i}`}>• {c.message}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs hover:underline"
          >
            닫기
          </button>
        </div>
      )}

      {notice && !conflicts.length && !error && (
        <p className="text-xs text-gray-400">{notice}</p>
      )}

      {/* ---- 본문 ----------------------------------------------------- */}
      {view === "table" ? (
        <TableView
          rows={visible}
          options={options}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onPatch={patchRow}
          busy={isPending}
        />
      ) : (
        <ResourceView
          rows={visible}
          options={options}
          axis={axis}
          onMove={patchRow}
          busy={isPending}
        />
      )}

      {/* ---- 실행취소 토스트 ------------------------------------------ */}
      {undoIds && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-gray-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{undoIds.length}건을 삭제했습니다.</span>
          <button
            type="button"
            onClick={undo}
            className="font-medium text-amber-300 hover:underline"
          >
            실행취소
          </button>
        </div>
      )}
    </div>
  );
}
