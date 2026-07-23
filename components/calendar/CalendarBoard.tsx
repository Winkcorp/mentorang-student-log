"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
 *  - 월/주/일 3가지 뷰
 *  - 날짜 셀은 세로 구분: 왼쪽 = 학생 과제, 오른쪽 = 그날 멘토·세션(등원)
 *  - 오른쪽 패널:
 *      · 학생 이름/일정 클릭 → 그 학생의 해당 날짜 할 일 전체 + 바로 수정
 *      · 빈 날짜 클릭 → 검색형 템플릿 픽커 + 자연어 빠른 입력
 *
 * 액션은 props로 주입: 실제 페이지는 서버 액션, 미리보기는 로컬 상태.
 */

export interface CalendarEvent {
  id: string;
  kind: "task" | "session" | "exception";
  date: string;
  title: string;
  studentId: string | null;
  studentName: string;
  mentorId?: string | null;
  mentorName?: string | null;
  subject?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  spanStart?: string;
  spanEnd?: string;
  sourceId?: string;
  linked?: boolean;
}

export interface Preset {
  id: string;
  kind: "task" | "session";
  label: string;
  subject?: string;
  content?: string;
  startTime?: string;
  endTime?: string;
}

export interface QuickCreatePayload {
  suggestion: QuickSuggestion;
  date: string;
  /** 지정하면 date ~ repeatUntil 기간에 매일 반복 생성 (task 전용) */
  repeatUntil?: string;
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
  updateTask?: (
    id: string,
    patch: { subject: string; content: string },
  ) => Promise<{ error: string | null }>;
}

export interface Person {
  id: string;
  name: string;
  school?: string | null;
  grade?: string | null;
}

export interface CalendarBoardProps {
  ym: string;
  events: CalendarEvent[];
  students: Person[];
  mentors: Person[];
  mentorStudents: Record<string, string[]>;
  actions: CalendarActions;
  role: "admin" | "mentor";
  presets?: Preset[];
  monthBasePath?: string;
  onNavigate?: (ym: string) => void;
  studentTasksBase?: string;
}

const DOT = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-cyan-500", "bg-lime-600", "bg-orange-500"];
const SOFT = ["bg-blue-50 text-blue-700", "bg-emerald-50 text-emerald-700", "bg-amber-50 text-amber-700", "bg-violet-50 text-violet-700", "bg-rose-50 text-rose-700", "bg-cyan-50 text-cyan-700", "bg-lime-50 text-lime-700", "bg-orange-50 text-orange-700"];
const EDGE = ["border-l-blue-400", "border-l-emerald-400", "border-l-amber-400", "border-l-violet-400", "border-l-rose-400", "border-l-cyan-400", "border-l-lime-500", "border-l-orange-400"];

const SESSION_STATUS_LABEL: Record<string, string> = {
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

const DAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];
const DAY_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

type ViewMode = "month" | "week" | "day";

function shiftYm(ym: string, diff: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + diff, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addDaysStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dowIdx(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
}

function buildWeeks(ym: string): string[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
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

function weekOf(date: string): string[] {
  const start = addDaysStr(date, -dowIdx(date));
  return Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));
}

type Panel =
  | { t: "date"; date: string }
  | { t: "focus"; date: string; studentId: string | null; ev?: CalendarEvent }
  | null;

export function CalendarBoard(props: CalendarBoardProps) {
  const {
    ym, events, students, mentors, mentorStudents, actions, role,
    presets = [], monthBasePath, onNavigate, studentTasksBase,
  } = props;

  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<string>(
    today.slice(0, 7) === ym ? today : `${ym}-01`,
  );
  const [kinds, setKinds] = useState<Set<string>>(new Set(["task", "session", "exception"]));
  const [studentSel, setStudentSel] = useState<string | null>(null);
  const [mentorSel, setMentorSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const colorIdx = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s, i) => map.set(s.id, i % DOT.length));
    return map;
  }, [students]);
  const ci = (id: string | null | undefined) => (id ? (colorIdx.get(id) ?? 0) : 0);

  const weeks = useMemo(() => buildWeeks(ym), [ym]);

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (!kinds.has(e.kind)) return false;
        if (studentSel && e.studentId && e.studentId !== studentSel) return false;
        if (mentorSel) {
          if (e.kind === "session") {
            if (e.mentorId !== mentorSel) return false;
          } else if (
            e.studentId &&
            !(mentorStudents[mentorSel] ?? []).includes(e.studentId)
          )
            return false;
        }
        return true;
      }),
    [events, kinds, studentSel, mentorSel, mentorStudents],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visible) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    for (const list of map.values())
      list.sort(
        (a, b) =>
          (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
          a.title.localeCompare(b.title),
      );
    return map;
  }, [visible]);

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

  function clearNotices() {
    setMessage(null);
    setError(null);
  }

  function navigateMonth(target: string) {
    if (target === ym) return;
    if (onNavigate) onNavigate(target);
    else if (monthBasePath) router.push(`${monthBasePath}?month=${target}`);
  }

  function goToday() {
    setAnchor(today);
    navigateMonth(today.slice(0, 7));
  }

  function navigate(dir: 1 | -1) {
    if (view === "month") {
      const target = shiftYm(ym, dir);
      setAnchor(`${target}-01`);
      navigateMonth(target);
    } else {
      const next = addDaysStr(anchor, dir * (view === "week" ? 7 : 1));
      setAnchor(next);
      if (next.slice(0, 7) !== ym) navigateMonth(next.slice(0, 7));
    }
  }

  function openDatePanel(date: string) {
    setPanel({ t: "date", date });
    clearNotices();
  }

  function openFocus(e: CalendarEvent) {
    setPanel({ t: "focus", date: e.date, studentId: e.studentId, ev: e });
    clearNotices();
  }

  function selectStudent(id: string) {
    if (studentSel === id) {
      setStudentSel(null);
      setPanel(null);
    } else {
      setStudentSel(id);
      setPanel({ t: "focus", date: today, studentId: id });
    }
    clearNotices();
  }

  const [yy, mm] = ym.split("-");
  const headTitle =
    view === "month"
      ? `${yy}년 ${Number(mm)}월`
      : view === "week"
        ? `${Number(anchor.slice(5, 7))}/${Number(weekOf(anchor)[0].slice(8, 10))} 주간`
        : `${Number(anchor.slice(5, 7))}/${Number(anchor.slice(8, 10))} (${DAY_FULL[dowIdx(anchor)]})`;

  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-[13px] text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors";

  // ── 셀 내부 렌더러: 세로 구분 (왼쪽 학생 과제 | 오른쪽 멘토·세션) ──
  function renderCellBody(date: string, dense: boolean) {
    const dayEvents = byDate.get(date) ?? [];
    const exceptions = dayEvents.filter((e) => e.kind === "exception");
    const tasks = dayEvents.filter((e) => e.kind === "task");
    const sessions = dayEvents.filter((e) => e.kind === "session");
    const clamp = dense ? "truncate" : "line-clamp-2";

    return (
      <>
        {exceptions.map((e) => (
          <button
            key={e.id}
            onClick={(ev) => {
              ev.stopPropagation();
              openFocus(e);
            }}
            title={`${e.studentName} · ${e.title}`}
            className="mb-[3px] block w-full truncate rounded-md bg-red-50 px-1.5 py-[3px] text-left text-[11px] text-red-500 hover:opacity-75"
          >
            🚫 {e.studentName} {e.title}
          </button>
        ))}
        {(tasks.length > 0 || sessions.length > 0) && (
          <div className="flex min-w-0 gap-1">
            {/* 왼쪽: 학생 과제 */}
            <div className="min-w-0 flex-1 space-y-[3px]">
              {tasks.map((e) => (
                <button
                  key={e.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openFocus(e);
                  }}
                  title={`${e.studentName} · ${e.title}`}
                  className={`block w-full rounded-md px-1.5 py-[3px] text-left text-[11px] leading-tight transition-opacity hover:opacity-75 ${clamp} ${
                    e.status === "done"
                      ? "bg-gray-50 text-gray-300 line-through"
                      : `border-l-2 bg-gray-50/80 text-gray-700 ${EDGE[ci(e.studentId)]}`
                  }`}
                >
                  {!studentSel && (
                    <span className="font-medium">{e.studentName}</span>
                  )}{" "}
                  {e.title}
                </button>
              ))}
            </div>
            {/* 세로 구분선 + 오른쪽: 멘토·세션 */}
            {sessions.length > 0 && (
              <>
                <div className="w-px shrink-0 bg-gray-200/80" />
                <div className={`min-w-0 space-y-[3px] ${dense ? "w-[42%]" : "w-[45%]"}`}>
                  {sessions.map((e) => (
                    <button
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openFocus(e);
                      }}
                      title={`${e.studentName} · ${e.mentorName ?? ""} ${e.startTime?.slice(0, 5)}`}
                      className={`block w-full rounded-md px-1.5 py-[3px] text-left text-[11px] font-medium leading-tight transition-opacity hover:opacity-75 ${clamp} ${SOFT[ci(e.studentId)]} ${
                        e.status === "canceled" ? "opacity-40 line-through" : ""
                      }`}
                    >
                      {e.startTime?.slice(0, 5)} {e.mentorName ?? e.studentName}
                      {!dense && (
                        <span className="font-normal"> · {e.studentName}</span>
                      )}
                      {e.status && e.status !== "completed" && (
                        <span className="font-normal"> ({SESSION_STATUS_LABEL[e.status]})</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 헤더 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">{headTitle}</h1>
          <span className="hidden text-xs text-gray-400 sm:inline">
            왼쪽 학생 과제 · 오른쪽 멘토 세션
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 뷰 전환 */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(
              [
                ["month", "월"],
                ["week", "주"],
                ["day", "일"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  if (anchor.slice(0, 7) !== ym) setAnchor(`${ym}-01`);
                }}
                className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
                  view === v ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button className={navBtn} onClick={() => navigate(-1)}>←</button>
            <button
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
              onClick={goToday}
            >
              오늘
            </button>
            <button className={navBtn} onClick={() => navigate(1)}>→</button>
          </div>
        </div>
      </div>

      {/* ── 레이어 필터 ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-gray-200/70 bg-white px-4 py-3">
        <div className="flex items-center gap-1.5">
          {(
            [
              ["task", "✏️ 과제"],
              ["session", "📅 세션"],
              ["exception", "🚫 예외"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                const next = new Set(kinds);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                setKinds(next);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                kinds.has(k)
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">학생</span>
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => selectStudent(s.id)}
              title="클릭하면 오른쪽에 오늘 할 일이 열립니다"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                studentSel === s.id
                  ? `${SOFT[ci(s.id)]} ring-1 ring-inset ring-current`
                  : studentSel
                    ? "text-gray-300 hover:text-gray-500"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[ci(s.id)]}`} />
              {s.name}
            </button>
          ))}
          {studentSel && (
            <button
              onClick={() => {
                setStudentSel(null);
                setPanel(null);
              }}
              className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline"
            >
              해제
            </button>
          )}
        </div>

        {mentors.length > 1 && (
          <>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">멘토</span>
              {mentors.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMentorSel(mentorSel === m.id ? null : m.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    mentorSel === m.id
                      ? "bg-gray-900 text-white"
                      : mentorSel
                        ? "text-gray-300 hover:text-gray-500"
                        : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {(error || message) && (
        <div
          className={`rounded-xl px-4 py-2.5 text-[13px] ${
            error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? message}
        </div>
      )}

      {/* ── 본문 ── */}
      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          {/* 월간 */}
          {view === "month" && (
            <div className="overflow-x-auto">
              <div className="min-w-[680px] overflow-hidden rounded-2xl border border-gray-200/70 bg-white">
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {DAY_HEADERS.map((d, i) => (
                    <div
                      key={d}
                      className={`px-2 py-2 text-center text-[11px] font-semibold ${
                        i >= 5 ? "text-rose-400" : "text-gray-400"
                      }`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                    {week.map((date) => {
                      const inMonth = date.slice(0, 7) === ym;
                      const isSelected = panel?.t === "date" && panel.date === date;
                      return (
                        <div
                          key={date}
                          onClick={() => openDatePanel(date)}
                          className={`min-h-[96px] cursor-pointer border-r border-gray-100 p-1 transition-colors last:border-r-0 ${
                            inMonth ? "bg-white" : "bg-gray-50/70"
                          } ${isSelected ? "bg-blue-50/60 ring-2 ring-inset ring-blue-300" : "hover:bg-gray-50"}`}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                                date === today
                                  ? "bg-blue-600 font-bold text-white"
                                  : inMonth
                                    ? "font-medium text-gray-600"
                                    : "text-gray-300"
                              }`}
                            >
                              {Number(date.slice(8, 10))}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setView("day");
                                setAnchor(date);
                              }}
                              className="hidden h-4 w-4 items-center justify-center rounded text-[10px] text-gray-300 hover:bg-gray-100 hover:text-gray-500 sm:flex"
                              title="일간 보기"
                            >
                              ⤢
                            </button>
                          </div>
                          {renderCellBody(date, true)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 주간 */}
          {view === "week" && (
            <div className="overflow-x-auto">
              <div className="grid min-w-[840px] grid-cols-7 overflow-hidden rounded-2xl border border-gray-200/70 bg-white">
                {weekOf(anchor).map((date, i) => {
                  const isSelected = panel?.t === "date" && panel.date === date;
                  return (
                    <div
                      key={date}
                      onClick={() => openDatePanel(date)}
                      className={`min-h-[420px] cursor-pointer border-r border-gray-100 last:border-r-0 ${
                        isSelected ? "bg-blue-50/50" : "hover:bg-gray-50/60"
                      }`}
                    >
                      <div
                        className={`border-b border-gray-100 px-2 py-2 text-center ${
                          date === today ? "bg-blue-50" : ""
                        }`}
                      >
                        <p className={`text-[11px] font-semibold ${i >= 5 ? "text-rose-400" : "text-gray-400"}`}>
                          {DAY_HEADERS[i]}
                        </p>
                        <p
                          className={`text-sm font-bold ${
                            date === today ? "text-blue-600" : "text-gray-800"
                          }`}
                        >
                          {Number(date.slice(8, 10))}
                        </p>
                      </div>
                      <div className="p-1.5">{renderCellBody(date, false)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 일간 */}
          {view === "day" && (
            <DayView
              date={anchor}
              events={byDate.get(anchor) ?? []}
              students={students}
              today={today}
              ci={ci}
              isPending={isPending}
              actions={actions}
              run={run}
              onAdd={() => openDatePanel(anchor)}
              onFocus={openFocus}
              studentSel={studentSel}
            />
          )}

          <p className="mt-2 text-[11px] text-gray-400">
            날짜 클릭 → 빠른 등록 · 일정 클릭 → 그날 할 일 전체·수정 · 학생 이름 클릭 → 오늘 할 일
          </p>
        </div>

        {/* ── 사이드 패널 ── */}
        <aside className="mt-4 lg:mt-0">
          <div className="rounded-2xl border border-gray-200/70 bg-white lg:sticky lg:top-24">
            {panel === null && (
              <div className="px-5 py-8 text-center">
                <p className="text-2xl">🗓️</p>
                <p className="mt-2 text-sm font-medium text-gray-700">무엇이든 클릭해 보세요</p>
                <ul className="mt-3 space-y-1.5 text-left text-xs text-gray-400">
                  <li>• <b className="text-gray-500">학생 이름</b> → 오늘 할 일 전체·수정</li>
                  <li>• <b className="text-gray-500">캘린더의 일정</b> → 그날 할 일 전체가 열리고 바로 수정</li>
                  <li>• <b className="text-gray-500">빈 날짜</b> → 검색·템플릿으로 빠른 등록</li>
                </ul>
              </div>
            )}

            {panel?.t === "focus" && (
              <FocusPanel
                key={`${panel.studentId}-${panel.date}-${panel.ev?.id ?? ""}`}
                date={panel.date}
                student={students.find((s) => s.id === panel.studentId) ?? null}
                focusEvent={panel.ev}
                colorClass={DOT[ci(panel.studentId)]}
                events={events}
                today={today}
                role={role}
                actions={actions}
                isPending={isPending}
                run={run}
                studentTasksBase={studentTasksBase}
                onClose={() => setPanel(null)}
              />
            )}

            {panel?.t === "date" && (
              <DatePanel
                date={panel.date}
                students={students}
                mentors={mentors}
                presets={presets}
                role={role}
                defaultStudentId={studentSel}
                actions={actions}
                isPending={isPending}
                run={run}
                onClose={() => setPanel(null)}
                colorOf={(id) => DOT[ci(id)]}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ══════════════ 일간 뷰: 학생별 과제 + 멘토별 세션 크게 ══════════════
function DayView({
  date, events, students, today, ci, isPending, actions, run, onAdd, onFocus, studentSel,
}: {
  date: string;
  events: CalendarEvent[];
  students: Person[];
  today: string;
  ci: (id: string | null | undefined) => number;
  isPending: boolean;
  actions: CalendarActions;
  run: (fn: () => Promise<{ error: string | null }>, ok?: string) => void;
  onAdd: () => void;
  onFocus: (e: CalendarEvent) => void;
  studentSel: string | null;
}) {
  const tasks = events.filter((e) => e.kind === "task");
  const sessions = events.filter((e) => e.kind === "session");
  const exceptions = events.filter((e) => e.kind === "exception");

  const activeStudents = students.filter(
    (s) =>
      (!studentSel || s.id === studentSel) &&
      (tasks.some((t) => t.studentId === s.id) ||
        sessions.some((x) => x.studentId === s.id)),
  );

  // 멘토별 세션 그룹
  const byMentor = new Map<string, CalendarEvent[]>();
  for (const s of sessions) {
    const key = s.mentorName ?? "미지정";
    if (!byMentor.has(key)) byMentor.set(key, []);
    byMentor.get(key)!.push(s);
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_260px]">
      {/* 학생별 과제 */}
      <div className="space-y-3">
        {exceptions.map((e) => (
          <button
            key={e.id}
            onClick={() => onFocus(e)}
            className="block w-full rounded-2xl border border-red-100 bg-red-50/70 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
          >
            🚫 {e.studentName} · {e.title}
            {e.spanStart && e.spanEnd !== e.spanStart && (
              <span className="ml-2 text-xs text-red-400">
                {e.spanStart} ~ {e.spanEnd}
              </span>
            )}
          </button>
        ))}

        {activeStudents.length === 0 && exceptions.length === 0 && (
          <div className="rounded-2xl border border-gray-200/70 bg-white px-4 py-10 text-center">
            <p className="text-sm text-gray-400">이 날 일정이 없습니다.</p>
            <button
              onClick={onAdd}
              className="mt-3 rounded-xl bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-700"
            >
              ＋ 일정 추가
            </button>
          </div>
        )}

        {activeStudents.map((s) => {
          const sTasks = tasks.filter((t) => t.studentId === s.id);
          const done = sTasks.filter((t) => t.status === "done").length;
          return (
            <div key={s.id} className="rounded-2xl border border-gray-200/70 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT[ci(s.id)]}`} />
                  <span className="text-sm font-bold text-gray-900">{s.name}</span>
                  <span className="text-xs text-gray-400">
                    {s.school} {s.grade}
                  </span>
                </div>
                {sTasks.length > 0 && (
                  <span className="text-[11px] font-medium text-gray-400">
                    {done}/{sTasks.length} 완료
                  </span>
                )}
              </div>
              {sTasks.length === 0 ? (
                <p className="text-xs text-gray-300">과제 없음</p>
              ) : (
                <ul className="space-y-1">
                  {sTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        disabled={isPending}
                        onChange={(e) =>
                          run(
                            () => actions.toggleTask(t.id, e.target.checked),
                            e.target.checked ? "완료! 순차 학습이면 복습이 자동 예약됩니다." : undefined,
                          )
                        }
                        className="h-4 w-4 accent-gray-900"
                      />
                      <button
                        onClick={() => onFocus(t)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                          {t.subject}
                        </span>
                        <span
                          className={`truncate text-[13px] ${
                            t.status === "done" ? "text-gray-300 line-through" : "text-gray-800"
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.linked && <span className="text-[10px] text-violet-400">연계</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* 멘토별 세션 타임라인 */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-gray-200/70 bg-white p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            이 날 세션 · 멘토별
          </h3>
          {byMentor.size === 0 ? (
            <p className="text-xs text-gray-300">세션 없음</p>
          ) : (
            <div className="space-y-3">
              {[...byMentor.entries()].map(([mentor, list]) => (
                <div key={mentor}>
                  <p className="mb-1 text-xs font-bold text-gray-700">{mentor}</p>
                  <ul className="space-y-1">
                    {list.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => onFocus(s)}
                          className={`block w-full rounded-xl px-2.5 py-1.5 text-left text-xs transition-opacity hover:opacity-75 ${SOFT[ci(s.studentId)]} ${
                            s.status === "canceled" ? "opacity-40 line-through" : ""
                          }`}
                        >
                          <b>
                            {s.startTime?.slice(0, 5)}~{s.endTime?.slice(0, 5)}
                          </b>{" "}
                          {s.studentName}
                          {s.status && s.status !== "completed" && (
                            <span> · {SESSION_STATUS_LABEL[s.status]}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onAdd}
            className="mt-3 w-full rounded-xl border border-dashed border-gray-300 py-2 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600"
          >
            ＋ 추가 {date === today ? "(오늘)" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════ 포커스 패널: 학생의 해당 날짜 할 일 전체 + 수정 ══════════════
function FocusPanel({
  date, student, focusEvent, colorClass, events, today, role, actions, isPending, run, studentTasksBase, onClose,
}: {
  date: string;
  student: Person | null;
  focusEvent?: CalendarEvent;
  colorClass: string;
  events: CalendarEvent[];
  today: string;
  role: "admin" | "mentor";
  actions: CalendarActions;
  isPending: boolean;
  run: (fn: () => Promise<{ error: string | null }>, ok?: string) => void;
  studentTasksBase?: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string; subject: string; content: string } | null>(null);
  const [newTask, setNewTask] = useState("");

  const focusId = focusEvent?.kind === "task" ? focusEvent.id : null;
  useEffect(() => {
    if (focusId) {
      const el = document.getElementById(`panel-task-${focusId}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [focusId]);

  const isToday = date === today;
  const dateLabel = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

  const dayTasks = student
    ? events
        .filter((e) => e.kind === "task" && e.studentId === student.id && e.date === date)
        .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0))
    : [];
  const doneCount = dayTasks.filter((t) => t.status === "done").length;

  const daySessions = student
    ? events.filter((e) => e.kind === "session" && e.studentId === student.id && e.date === date)
    : [];

  const upcoming = student
    ? events
        .filter((e) => e.kind === "session" && e.studentId === student.id && e.date > date)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""))
        .slice(0, 3)
    : [];

  function addTask() {
    const content = newTask.trim();
    if (!content || !student) return;
    const SUBJECTS = ["국어", "영어", "수학", "과학", "사회", "한국사"];
    const subject = SUBJECTS.find((s) => content.startsWith(s)) ?? "기타";
    const body = subject === "기타" ? content : content.slice(subject.length).trim() || `${subject} 학습`;
    run(
      () =>
        actions.quickCreate({
          date,
          suggestion: {
            kind: "task",
            studentId: student.id,
            studentName: student.name,
            subject,
            content: body,
            label: "",
          },
        }),
      `${dateLabel} 과제로 추가했습니다.`,
    );
    setNewTask("");
  }

  const actionBtn =
    "rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors";

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {student ? (
            <>
              <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
              <h2 className="text-[15px] font-bold text-gray-900">{student.name}</h2>
              {(student.school || student.grade) && (
                <span className="text-xs text-gray-400">
                  {student.school} {student.grade}
                </span>
              )}
            </>
          ) : (
            <h2 className="text-[15px] font-bold text-gray-900">전체 예외일정</h2>
          )}
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500">✕</button>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-400">{isToday ? `오늘 · ${dateLabel}` : dateLabel}</p>

      {focusEvent?.kind === "session" && (
        <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
          <p className="text-xs font-semibold text-gray-700">
            📅 세션 {focusEvent.startTime?.slice(0, 5)}~{focusEvent.endTime?.slice(0, 5)}
            {focusEvent.mentorName && (
              <span className="ml-1.5 font-normal text-gray-400">{focusEvent.mentorName}</span>
            )}
            <span className="ml-1.5 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500">
              {SESSION_STATUS_LABEL[focusEvent.status ?? ""]}
            </span>
          </p>
          {focusEvent.status !== "makeup" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["completed", "no_show", "canceled"] as const)
                .filter((s) => s !== focusEvent.status)
                .map((s) => (
                  <button
                    key={s}
                    disabled={isPending}
                    className={actionBtn}
                    onClick={() =>
                      run(
                        () => actions.setSessionStatus(focusEvent.id, s),
                        `세션을 ${SESSION_STATUS_LABEL[s]}(으)로 변경했습니다.`,
                      )
                    }
                  >
                    {SESSION_STATUS_LABEL[s]}로 변경
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {focusEvent?.kind === "exception" && (
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50/60 p-3">
          <p className="text-xs font-semibold text-red-600">
            🚫 {focusEvent.title}
            {focusEvent.spanStart && focusEvent.spanEnd !== focusEvent.spanStart && (
              <span className="ml-1.5 font-normal text-red-400">
                {focusEvent.spanStart} ~ {focusEvent.spanEnd}
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] text-red-400">이 기간엔 매일 반복·순차 과제가 생성되지 않습니다</p>
          {role === "admin" && actions.deleteException && (
            <button
              disabled={isPending}
              className={`${actionBtn} mt-2 text-red-500`}
              onClick={() => {
                run(() => actions.deleteException!(focusEvent.sourceId ?? focusEvent.id), "예외일정을 삭제했습니다.");
                onClose();
              }}
            >
              예외일정 삭제
            </button>
          )}
        </div>
      )}

      {student && focusEvent?.kind !== "session" && daySessions.length > 0 && (
        <div className="mt-3 space-y-1">
          {daySessions.map((s) => (
            <p key={s.id} className="text-[11px] text-gray-400">
              📅 {s.startTime?.slice(0, 5)}~{s.endTime?.slice(0, 5)}
              {s.mentorName && ` · ${s.mentorName}`} · {SESSION_STATUS_LABEL[s.status ?? ""]}
            </p>
          ))}
        </div>
      )}

      {student && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {isToday ? "오늘 할 일" : `${dateLabel} 할 일`}
            </h3>
            {dayTasks.length > 0 && (
              <span className="text-[11px] font-medium text-gray-400">
                {doneCount}/{dayTasks.length} 완료
              </span>
            )}
          </div>

          {dayTasks.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
              이 날 과제가 없습니다. 아래에서 바로 추가하세요.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
              {dayTasks.map((t) => (
                <li
                  key={t.id}
                  id={`panel-task-${t.id}`}
                  className={`group rounded-xl border px-2.5 py-2 transition-colors ${
                    focusId === t.id ? "border-blue-300 bg-blue-50/60" : "border-gray-100 bg-gray-50/50"
                  }`}
                >
                  {editing?.id === t.id ? (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <input
                          value={editing.subject}
                          onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                        />
                        <input
                          autoFocus
                          value={editing.content}
                          onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && actions.updateTask) {
                              run(
                                () => actions.updateTask!(t.id, { subject: editing.subject, content: editing.content }),
                                "수정했습니다.",
                              );
                              setEditing(null);
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={isPending}
                          onClick={() => {
                            if (!actions.updateTask) return;
                            run(
                              () => actions.updateTask!(t.id, { subject: editing.subject, content: editing.content }),
                              "수정했습니다.",
                            );
                            setEditing(null);
                          }}
                          className="rounded-lg bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white"
                        >
                          저장
                        </button>
                        <button onClick={() => setEditing(null)} className="text-[11px] text-gray-400 hover:underline">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        disabled={isPending}
                        onChange={(e) =>
                          run(
                            () => actions.toggleTask(t.id, e.target.checked),
                            e.target.checked ? "완료! 순차 학습이면 복습이 자동 예약됩니다." : undefined,
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-gray-900"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="mr-1.5 text-[10px] font-semibold text-gray-400">{t.subject}</span>
                        <span
                          className={`text-xs ${
                            t.status === "done" ? "text-gray-300 line-through" : "text-gray-800"
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.linked && <span className="ml-1 text-[10px] text-violet-400">연계</span>}
                      </div>
                      <div
                        className={`flex shrink-0 gap-1 transition-opacity ${
                          focusId === t.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {actions.updateTask && (
                          <button
                            onClick={() => setEditing({ id: t.id, subject: t.subject ?? "", content: t.title })}
                            className="text-[11px] text-gray-400 hover:text-gray-700"
                            title="수정"
                          >
                            ✎
                          </button>
                        )}
                        <button
                          disabled={isPending}
                          onClick={() => run(() => actions.deleteTask(t.id), "삭제했습니다.")}
                          className="text-[11px] text-gray-400 hover:text-red-500"
                          title="삭제"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex gap-1.5">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder={`예: 영어 단어 Day 31 (Enter로 ${dateLabel}에 추가)`}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs focus:border-gray-400 focus:outline-none"
            />
            <button
              disabled={isPending || !newTask.trim()}
              onClick={addTask}
              className="rounded-xl bg-gray-900 px-3 text-xs font-medium text-white disabled:opacity-30"
            >
              추가
            </button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">예정 세션</h3>
          <ul className="space-y-1">
            {upcoming.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-gray-300">📅</span>
                {Number(s.date.slice(5, 7))}/{Number(s.date.slice(8, 10))}{" "}
                {s.startTime?.slice(0, 5)}~{s.endTime?.slice(0, 5)}
                {s.mentorName && <span className="text-gray-400">· {s.mentorName}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {student && studentTasksBase && (
        <Link
          href={`${studentTasksBase}/${student.id}/tasks`}
          className="mt-4 block text-center text-xs font-medium text-blue-600 hover:underline"
        >
          전체 과제 이력 보기 →
        </Link>
      )}
    </div>
  );
}

// ══════════════ 날짜 패널: 템플릿 픽커 + 자연어 입력 ══════════════
function DatePanel({
  date, students, mentors, presets, role, defaultStudentId, actions, isPending, run, onClose, colorOf,
}: {
  date: string;
  students: Person[];
  mentors: Person[];
  presets: Preset[];
  role: "admin" | "mentor";
  defaultStudentId: string | null;
  actions: CalendarActions;
  isPending: boolean;
  run: (fn: () => Promise<{ error: string | null }>, ok?: string) => void;
  onClose: () => void;
  colorOf: (id: string) => string;
}) {
  const SUBJECT_OPTIONS = ["국어", "영어", "수학", "과학", "사회", "한국사", "탐구", "기타"];

  const [input, setInput] = useState("");
  const [pickedStudent, setPickedStudent] = useState<string | null>(defaultStudentId);
  // 구조화 입력: [과목 선택][상세 내용][기간]
  const [subject, setSubject] = useState("국어");
  const [content, setContent] = useState("");
  const [repeatMode, setRepeatMode] = useState<"once" | "daily">("once");
  const [until, setUntil] = useState(addDaysStr(date, 6));

  const student = students.find((s) => s.id === pickedStudent) ?? null;

  function submitStructured() {
    if (!student || !content.trim()) return;
    run(
      () =>
        actions.quickCreate({
          date,
          repeatUntil: repeatMode === "daily" ? until : undefined,
          suggestion: {
            kind: "task",
            studentId: student.id,
            studentName: student.name,
            subject,
            content: content.trim(),
            label: "",
          },
        }),
      repeatMode === "daily"
        ? `${date} ~ ${until} 매일 등록했습니다.`
        : "등록했습니다.",
    );
    setContent("");
  }

  const ctx: QuickAddContext = {
    date,
    students,
    mentors,
    defaultStudentId: pickedStudent ?? undefined,
    allowException: role === "admin",
  };
  const suggestions = input.trim()
    ? parseQuickAdd(input, ctx).filter((s) => s.kind !== "hint")
    : [];

  const q = input.trim().toLowerCase();
  const filteredPresets = presets.filter(
    (p) =>
      !q ||
      p.label.toLowerCase().includes(q) ||
      p.subject?.toLowerCase().includes(q) ||
      p.content?.toLowerCase().includes(q),
  );

  function applySuggestion(s: QuickSuggestion) {
    if (s.kind === "hint") return;
    run(() => actions.quickCreate({ suggestion: s, date }), "등록했습니다.");
    setInput("");
  }

  function applyPreset(p: Preset) {
    if (!student) return;
    if (p.kind === "task") {
      applySuggestion({
        kind: "task",
        studentId: student.id,
        studentName: student.name,
        subject: p.subject ?? "기타",
        content: p.content ?? p.label,
        label: "",
      });
    } else {
      applySuggestion({
        kind: "session",
        studentId: student.id,
        studentName: student.name,
        mentorId: null,
        mentorName: null,
        startTime: p.startTime ?? "19:00",
        endTime: p.endTime ?? "21:00",
        label: "",
      });
    }
  }

  const [, mm, dd] = date.split("-");

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-gray-900">
          {Number(mm)}/{Number(dd)} 에 등록
        </h2>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500">✕</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {students.map((s) => (
          <button
            key={s.id}
            onClick={() => setPickedStudent(pickedStudent === s.id ? null : s.id)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              pickedStudent === s.id
                ? "bg-gray-900 text-white"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${colorOf(s.id)}`} />
            {s.name}
          </button>
        ))}
      </div>

      {/* ── 구조화 입력: [과목 ▾][상세 내용] + 기간 ── */}
      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          과제 직접 입력
        </p>
        <div className="flex gap-1.5">
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-[76px] shrink-0 rounded-lg border border-gray-200 bg-white px-1.5 py-2 text-xs focus:border-gray-400 focus:outline-none"
          >
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitStructured()}
            placeholder="상세 내용 (예: 강기본 2강)"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(
              [
                ["once", "하루만"],
                ["daily", "매일 반복"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setRepeatMode(m)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  repeatMode === m ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {repeatMode === "daily" && (
            <>
              <span className="text-[11px] text-gray-400">~</span>
              <input
                type="date"
                value={until}
                min={date}
                onChange={(e) => setUntil(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px]"
              />
              <button
                onClick={() => setUntil(addDaysStr(date, 6))}
                className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline"
              >
                일주일
              </button>
              <button
                onClick={() => setUntil(addDaysStr(date, 13))}
                className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline"
              >
                2주
              </button>
            </>
          )}
          <button
            disabled={isPending || !student || !content.trim()}
            onClick={submitStructured}
            className="ml-auto rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-gray-700 disabled:opacity-30"
          >
            등록
          </button>
        </div>
        {!student && (
          <p className="mt-1.5 text-[10px] text-amber-500">위에서 학생을 먼저 선택하세요</p>
        )}
      </div>

      <p className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        또는 검색·자연어로
      </p>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions[0]) {
            e.preventDefault();
            applySuggestion(suggestions[0]);
          }
        }}
        placeholder={
          student
            ? "검색 또는 입력 (예: 국어 비문학 2지문 · 세션 7시-9시)"
            : "학생을 먼저 선택하거나, 이름 포함해 입력"
        }
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] focus:border-gray-400 focus:outline-none"
      />

      {suggestions.length > 0 && (
        <div className="mt-2 space-y-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              disabled={isPending}
              onClick={() => applySuggestion(s)}
              className="flex w-full items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-left text-xs text-gray-800 transition-colors hover:bg-blue-100/70 disabled:opacity-50"
            >
              <span className="truncate">{s.label}</span>
              {i === 0 && (
                <span className="ml-2 shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-400">↵</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          빠른 선택{q && ` — "${input.trim()}" 검색`}
        </h3>
        {!student && (
          <p className="mb-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-600">
            위에서 학생을 선택하면 클릭 한 번으로 등록됩니다
          </p>
        )}
        <ul className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
          {filteredPresets.map((p) => (
            <li key={p.id}>
              <button
                disabled={isPending || !student}
                onClick={() => applyPreset(p)}
                className="flex w-full items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="shrink-0">{p.kind === "session" ? "📅" : "✏️"}</span>
                {p.subject && (
                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                    {p.subject}
                  </span>
                )}
                <span className="truncate">{p.label}</span>
                <span className="ml-auto shrink-0 text-[10px] text-gray-300">＋</span>
              </button>
            </li>
          ))}
          {filteredPresets.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-gray-300">
              검색 결과가 없습니다 — 위 입력창의 내용 그대로 등록하려면 Enter
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
