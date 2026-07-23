"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseQuickAdd,
  type QuickAddContext,
  type QuickSuggestion,
} from "@/lib/quickadd/parse";

/**
 * 통합 캘린더 보드 — 과제·세션(등원)·예외일정을 한 화면에서 관리.
 *
 *  - 레이어 필터: 종류 / 학생 / 멘토 (구글 캘린더의 캘린더 목록처럼 토글)
 *  - 날짜 클릭 → 자연어 빠른 입력 + 실시간 해석 제안
 *  - 일정 클릭 → 인스펙터에서 바로 완료/상태 변경/삭제
 *
 * 액션은 props로 주입: 실제 페이지는 서버 액션, 미리보기는 로컬 상태.
 */

export interface CalendarEvent {
  id: string;
  kind: "task" | "session" | "exception";
  date: string;
  title: string;
  studentId: string | null; // exception 전체(학원 단위)면 null
  studentName: string;
  mentorId?: string | null;
  mentorName?: string | null;
  subject?: string;
  /** task: planned/done · session: completed/no_show/canceled/makeup */
  status?: string;
  startTime?: string;
  endTime?: string;
  /** exception 원본 기간 */
  spanStart?: string;
  spanEnd?: string;
  /** 펼쳐진 이벤트의 원본 레코드 id (exception 삭제용) */
  sourceId?: string;
  /** 복습/조건부 등 연계 과제 여부 */
  linked?: boolean;
}

export interface QuickCreatePayload {
  suggestion: QuickSuggestion;
  date: string;
}

export interface CalendarActions {
  quickCreate: (p: QuickCreatePayload) => Promise<{ error: string | null }>;
  toggleTask: (id: string, done: boolean) => Promise<{ error: string | null }>;
  setSessionStatus: (
    id: string,
    status: "completed" | "no_show" | "canceled",
  ) => Promise<{ error: string | null }>;
  deleteTask: (id: string) => Promise<{ error: string | null }>;
  deleteException?: (id: string) => Promise<{ error: string | null }>;
}

interface Person {
  id: string;
  name: string;
}

export interface CalendarBoardProps {
  ym: string; // YYYY-MM
  events: CalendarEvent[];
  students: Person[];
  mentors: Person[];
  /** 멘토별 담당 학생 id (멘토 레이어로 과제·예외까지 필터하기 위함) */
  mentorStudents: Record<string, string[]>;
  actions: CalendarActions;
  role: "admin" | "mentor";
  /** 월 이동: 링크 기반(?month=) — 미리보기는 onNavigate 사용 */
  monthBasePath?: string;
  onNavigate?: (ym: string) => void;
  /** 학생 과제 페이지 링크 base (예: /admin/students) */
  studentTasksBase?: string;
}

const STUDENT_COLORS = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-cyan-100 text-cyan-800 border-cyan-200",
  "bg-lime-100 text-lime-800 border-lime-200",
  "bg-orange-100 text-orange-800 border-orange-200",
];

const DOT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-orange-500",
];

const SESSION_STATUS_LABEL: Record<string, string> = {
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

const DAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];

function shiftYm(ym: string, diff: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + diff, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildWeeks(ym: string): string[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // 월=0
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - offset);

  const weeks: string[][] = [];
  const cur = new Date(start);
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (cur.getUTCMonth() === m - 1);
  return weeks;
}

export function CalendarBoard(props: CalendarBoardProps) {
  const {
    ym,
    events,
    students,
    mentors,
    mentorStudents,
    actions,
    role,
    monthBasePath,
    onNavigate,
    studentTasksBase,
  } = props;

  const router = useRouter();
  const [kinds, setKinds] = useState<Set<string>>(
    new Set(["task", "session", "exception"]),
  );
  const [studentFilter, setStudentFilter] = useState<Set<string>>(new Set());
  const [mentorFilter, setMentorFilter] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const colorIdx = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s, i) => map.set(s.id, i % STUDENT_COLORS.length));
    return map;
  }, [students]);

  const today = new Date().toISOString().slice(0, 10);
  const weeks = useMemo(() => buildWeeks(ym), [ym]);

  // ---- 필터 적용 ----
  const mentorStudentSet = useMemo(() => {
    if (mentorFilter.size === 0) return null;
    const set = new Set<string>();
    for (const m of mentorFilter)
      for (const sid of mentorStudents[m] ?? []) set.add(sid);
    return set;
  }, [mentorFilter, mentorStudents]);

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (!kinds.has(e.kind)) return false;
        if (studentFilter.size > 0) {
          // 전체(학원 단위) 예외는 학생 필터와 무관하게 표시
          if (e.studentId && !studentFilter.has(e.studentId)) return false;
        }
        if (mentorStudentSet) {
          if (e.kind === "session") {
            if (!e.mentorId || !mentorFilter.has(e.mentorId)) return false;
          } else if (e.studentId && !mentorStudentSet.has(e.studentId)) {
            return false;
          }
        }
        return true;
      }),
    [events, kinds, studentFilter, mentorFilter, mentorStudentSet],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visible) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    const order = { exception: 0, session: 1, task: 2 };
    for (const list of map.values())
      list.sort(
        (a, b) =>
          order[a.kind] - order[b.kind] ||
          (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
          a.title.localeCompare(b.title),
      );
    return map;
  }, [visible]);

  // ---- 빠른 입력 제안 ----
  const quickCtx: QuickAddContext | null = selectedDate
    ? {
        date: selectedDate,
        students,
        mentors,
        defaultStudentId:
          studentFilter.size === 1 ? [...studentFilter][0] : undefined,
        allowException: role === "admin",
      }
    : null;
  const suggestions =
    quickCtx && input.trim() ? parseQuickAdd(input, quickCtx) : [];

  function run(fn: () => Promise<{ error: string | null }>, okMsg?: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        if (okMsg) setMessage(okMsg);
        router.refresh();
      }
    });
  }

  function applySuggestion(s: QuickSuggestion) {
    if (s.kind === "hint" || !selectedDate) return;
    run(
      () => actions.quickCreate({ suggestion: s, date: selectedDate }),
      "등록되었습니다.",
    );
    setInput("");
  }

  function toggleSet(
    set: Set<string>,
    value: string,
    setter: (s: Set<string>) => void,
  ) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  const prevYm = shiftYm(ym, -1);
  const nextYm = shiftYm(ym, 1);
  const [yy, mm] = ym.split("-");

  const navBtn =
    "rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-100";

  return (
    <div className="space-y-4">
      {/* ── 헤더: 월 이동 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {yy}년 {Number(mm)}월
        </h1>
        <div className="flex items-center gap-1.5">
          {onNavigate ? (
            <>
              <button className={navBtn} onClick={() => onNavigate(prevYm)}>
                ◀
              </button>
              <button
                className={navBtn}
                onClick={() => onNavigate(today.slice(0, 7))}
              >
                오늘
              </button>
              <button className={navBtn} onClick={() => onNavigate(nextYm)}>
                ▶
              </button>
            </>
          ) : (
            <>
              <Link className={navBtn} href={`${monthBasePath}?month=${prevYm}`}>
                ◀
              </Link>
              <Link
                className={navBtn}
                href={`${monthBasePath}?month=${today.slice(0, 7)}`}
              >
                오늘
              </Link>
              <Link className={navBtn} href={`${monthBasePath}?month=${nextYm}`}>
                ▶
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── 레이어 필터 ── */}
      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 text-xs font-semibold text-gray-400">종류</span>
          {(
            [
              ["task", "✏️ 과제"],
              ["session", "📅 세션(등원)"],
              ["exception", "🚫 예외일정"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => toggleSet(kinds, k, setKinds)}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                kinds.has(k)
                  ? "border-gray-700 bg-gray-800 text-white"
                  : "border-gray-300 bg-white text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10 text-xs font-semibold text-gray-400">학생</span>
          <button
            onClick={() => setStudentFilter(new Set())}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              studentFilter.size === 0
                ? "border-gray-700 bg-gray-800 text-white"
                : "border-gray-300 text-gray-500"
            }`}
          >
            전체
          </button>
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSet(studentFilter, s.id, setStudentFilter)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
                studentFilter.size === 0 || studentFilter.has(s.id)
                  ? "border-gray-300 bg-white text-gray-800"
                  : "border-gray-200 bg-gray-50 text-gray-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${DOT_COLORS[colorIdx.get(s.id) ?? 0]}`}
              />
              {s.name}
            </button>
          ))}
        </div>
        {mentors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-10 text-xs font-semibold text-gray-400">
              멘토
            </span>
            <button
              onClick={() => setMentorFilter(new Set())}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                mentorFilter.size === 0
                  ? "border-gray-700 bg-gray-800 text-white"
                  : "border-gray-300 text-gray-500"
              }`}
            >
              전체
            </button>
            {mentors.map((m) => (
              <button
                key={m.id}
                onClick={() => toggleSet(mentorFilter, m.id, setMentorFilter)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  mentorFilter.size === 0 || mentorFilter.has(m.id)
                    ? "border-gray-300 bg-white text-gray-800"
                    : "border-gray-200 bg-gray-50 text-gray-300"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 인스펙터: 빠른 입력 / 일정 상세 ── */}
      {(selectedDate || selectedEvent) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          {selectedEvent ? (
            <EventInspector
              event={selectedEvent}
              role={role}
              actions={actions}
              isPending={isPending}
              run={run}
              onClose={() => setSelectedEvent(null)}
              studentTasksBase={studentTasksBase}
            />
          ) : (
            selectedDate && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">
                    {selectedDate} 에 추가
                  </p>
                  <button
                    onClick={() => {
                      setSelectedDate(null);
                      setInput("");
                    }}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    닫기 ✕
                  </button>
                </div>
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && suggestions[0]) {
                      e.preventDefault();
                      applySuggestion(suggestions[0]);
                    }
                  }}
                  placeholder="예: 김학생 국어 강기본 2강 · 이학생 세션 19:00-21:00 · 김학생 가족여행 ~8/7"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                {suggestions.length > 0 && (
                  <ul className="space-y-1">
                    {suggestions.map((s, i) => (
                      <li key={i}>
                        {s.kind === "hint" ? (
                          <p className="px-2 py-1 text-xs text-gray-500">
                            💡 {s.label}
                          </p>
                        ) : (
                          <button
                            disabled={isPending}
                            onClick={() => applySuggestion(s)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-800 hover:border-blue-400 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {s.label}
                            {i === 0 && (
                              <span className="ml-2 text-xs text-gray-400">
                                Enter ↵
                              </span>
                            )}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {message && <p className="mt-2 text-sm text-green-700">{message}</p>}
        </div>
      )}

      {/* ── 월 그리드 ── */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px] overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {DAY_HEADERS.map((d, i) => (
              <div
                key={d}
                className={`px-2 py-1.5 text-center text-xs font-semibold ${
                  i >= 5 ? "text-rose-500" : "text-gray-500"
                }`}
              >
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7 border-b border-gray-100 last:border-b-0"
            >
              {week.map((date) => {
                const inMonth = date.slice(0, 7) === ym;
                const dayEvents = byDate.get(date) ?? [];
                return (
                  <div
                    key={date}
                    onClick={() => {
                      setSelectedEvent(null);
                      setSelectedDate(date);
                      setMessage(null);
                      setError(null);
                    }}
                    className={`min-h-24 cursor-pointer border-r border-gray-100 p-1 align-top last:border-r-0 hover:bg-blue-50/40 ${
                      inMonth ? "bg-white" : "bg-gray-50/60"
                    } ${selectedDate === date && !selectedEvent ? "ring-2 ring-inset ring-blue-400" : ""}`}
                  >
                    <div
                      className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                        date === today
                          ? "bg-blue-600 font-bold text-white"
                          : inMonth
                            ? "text-gray-700"
                            : "text-gray-300"
                      }`}
                    >
                      {Number(date.slice(8, 10))}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.map((e) => (
                        <button
                          key={e.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedDate(null);
                            setSelectedEvent(e);
                            setMessage(null);
                            setError(null);
                          }}
                          className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] leading-tight ${
                            e.kind === "exception"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : e.kind === "session"
                                ? `${STUDENT_COLORS[e.studentId ? (colorIdx.get(e.studentId) ?? 0) : 0]} font-medium`
                                : e.status === "done"
                                  ? "border-gray-200 bg-gray-50 text-gray-400 line-through"
                                  : STUDENT_COLORS[
                                      e.studentId
                                        ? (colorIdx.get(e.studentId) ?? 0)
                                        : 0
                                    ]
                          }`}
                          title={`${e.studentName} · ${e.title}`}
                        >
                          {e.kind === "session" && (
                            <span className="mr-0.5">
                              📅{e.startTime?.slice(0, 5)}
                            </span>
                          )}
                          {e.kind === "exception" && "🚫 "}
                          {e.kind === "task" && e.status === "done" && "✓ "}
                          {e.studentName && `${e.studentName} `}
                          {e.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">
        빈 칸 클릭 → 빠른 입력 · 일정 클릭 → 완료 체크/상태 변경 · 상단
        레이어로 학생/멘토별 필터
      </p>
    </div>
  );
}

// ── 일정 상세 인스펙터 ──
function EventInspector({
  event,
  role,
  actions,
  isPending,
  run,
  onClose,
  studentTasksBase,
}: {
  event: CalendarEvent;
  role: "admin" | "mentor";
  actions: CalendarActions;
  isPending: boolean;
  run: (fn: () => Promise<{ error: string | null }>, okMsg?: string) => void;
  onClose: () => void;
  studentTasksBase?: string;
}) {
  const btn =
    "rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          {event.kind === "task" && "✏️ 과제"}
          {event.kind === "session" && "📅 세션"}
          {event.kind === "exception" && "🚫 예외일정"}
          <span className="ml-2 font-normal text-gray-600">
            {event.studentName} · {event.date}
            {event.startTime &&
              ` ${event.startTime.slice(0, 5)}~${event.endTime?.slice(0, 5)}`}
            {event.spanStart &&
              event.spanEnd !== event.spanStart &&
              ` (${event.spanStart} ~ ${event.spanEnd})`}
          </span>
        </p>
        <button onClick={onClose} className="text-xs text-gray-400 hover:underline">
          닫기 ✕
        </button>
      </div>
      <p className="text-sm text-gray-900">
        {event.subject && (
          <span className="mr-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-blue-700">
            {event.subject}
          </span>
        )}
        {event.title}
        {event.mentorName && (
          <span className="ml-2 text-xs text-gray-500">
            멘토: {event.mentorName}
          </span>
        )}
        {event.linked && (
          <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-600">
            연계
          </span>
        )}
        {event.kind === "session" && event.status && (
          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-gray-600">
            {SESSION_STATUS_LABEL[event.status]}
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {event.kind === "task" && (
          <>
            <button
              disabled={isPending}
              className={btn}
              onClick={() =>
                run(
                  () =>
                    actions.toggleTask(event.id, event.status !== "done"),
                  event.status !== "done"
                    ? "완료 처리했습니다. (순차 학습이면 복습 과제가 자동 생성됩니다)"
                    : "완료를 취소했습니다.",
                )
              }
            >
              {event.status === "done" ? "완료 취소" : "✓ 완료"}
            </button>
            <button
              disabled={isPending}
              className={`${btn} text-red-600`}
              onClick={() => run(() => actions.deleteTask(event.id), "삭제했습니다.")}
            >
              삭제
            </button>
            {studentTasksBase && event.studentId && (
              <Link
                href={`${studentTasksBase}/${event.studentId}/tasks`}
                className="text-xs text-blue-600 hover:underline"
              >
                이 학생 과제 전체 보기 →
              </Link>
            )}
          </>
        )}
        {event.kind === "session" &&
          event.status !== "makeup" &&
          (["completed", "no_show", "canceled"] as const)
            .filter((s) => s !== event.status)
            .map((s) => (
              <button
                key={s}
                disabled={isPending}
                className={btn}
                onClick={() =>
                  run(
                    () => actions.setSessionStatus(event.id, s),
                    `${SESSION_STATUS_LABEL[s]}(으)로 변경했습니다.`,
                  )
                }
              >
                {SESSION_STATUS_LABEL[s]}로 변경
              </button>
            ))}
        {event.kind === "session" && event.status === "canceled" && (
          <span className="text-xs text-gray-500">
            대체수업 연결은 세션 관리 화면에서
          </span>
        )}
        {event.kind === "exception" &&
          role === "admin" &&
          actions.deleteException && (
            <button
              disabled={isPending}
              className={`${btn} text-red-600`}
              onClick={() =>
                run(
                  () => actions.deleteException!(event.sourceId ?? event.id),
                  "삭제했습니다.",
                )
              }
            >
              예외일정 삭제
            </button>
          )}
      </div>
    </div>
  );
}
