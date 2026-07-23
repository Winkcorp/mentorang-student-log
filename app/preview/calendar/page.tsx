"use client";

import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  CalendarBoard,
  type CalendarEvent,
  type QuickCreatePayload,
} from "@/components/calendar/CalendarBoard";

/**
 * 미리보기 캘린더 — DB 없이 로컬 상태로 모든 동작이 실제로 작동한다.
 * (빠른 입력, 완료 체크 → 복습 자동 생성, 세션 상태 변경, 삭제, 레이어 필터)
 */

const STUDENTS = [
  { id: "s1", name: "김학생" },
  { id: "s2", name: "이학생" },
  { id: "s3", name: "박학생" },
];
const MENTORS = [
  { id: "m1", name: "박멘토" },
  { id: "m2", name: "최멘토" },
];
const MENTOR_STUDENTS = { m1: ["s1", "s2"], m2: ["s3"] };

const NAV = [
  { href: "/preview/calendar", label: "캘린더" },
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/settlements", label: "정산" },
];

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 해당 월의 데모 이벤트 생성 (요일 패턴 기반, 결정적) */
function mockMonth(ym: string): CalendarEvent[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);
  const events: CalendarEvent[] = [];
  let seqUnit = 25;

  // 둘째 주 수~금: 김학생 가족여행 (예외일정)
  const tripDays: string[] = [];
  for (let day = 1; day <= last; day++) {
    const date = `${ym}-${String(day).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
    if (day >= 8 && day <= 14 && dow >= 3 && dow <= 5) tripDays.push(date);
  }
  for (const date of tripDays) {
    events.push({
      id: `ex-trip-${date}`,
      sourceId: "ex-trip",
      kind: "exception",
      date,
      title: "가족여행",
      studentId: "s1",
      studentName: "김학생",
      spanStart: tripDays[0],
      spanEnd: tripDays[tripDays.length - 1],
    });
  }

  for (let day = 1; day <= last; day++) {
    const date = `${ym}-${String(day).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const past = date < today;
    const onTrip = tripDays.includes(date);

    if (dow >= 1 && dow <= 6 && !onTrip) {
      // 김학생: 국어 매일 + 영어 순차
      events.push({
        id: `t-daily-${date}`,
        kind: "task",
        date,
        title: "강기본 하루 2강씩",
        subject: "국어",
        status: past ? "done" : "planned",
        studentId: "s1",
        studentName: "김학생",
      });
      events.push({
        id: `t-seq-${date}`,
        kind: "task",
        date,
        title: `Day ${seqUnit}-${seqUnit + 2}`,
        subject: "영어",
        status: past && day % 3 !== 0 ? "done" : "planned",
        studentId: "s1",
        studentName: "김학생",
      });
      seqUnit += 3;
    }
    if (dow >= 1 && dow <= 5) {
      // 이학생: 수학 조건부 트리거
      events.push({
        id: `t-cond-${date}`,
        kind: "task",
        date,
        title: "수1 인강 1강 시청",
        subject: "수학",
        status: past && day % 2 === 0 ? "done" : "planned",
        studentId: "s2",
        studentName: "이학생",
      });
    }
    // 세션(등원): 월/수 김학생, 화/목 이학생, 금 박학생
    if ((dow === 1 || dow === 3) && !onTrip) {
      events.push({
        id: `ss-s1-${date}`,
        kind: "session",
        date,
        title: "세션",
        status: past ? "completed" : "completed",
        studentId: "s1",
        studentName: "김학생",
        mentorId: "m1",
        mentorName: "박멘토",
        startTime: "19:00",
        endTime: "21:00",
      });
    }
    if (dow === 2 || dow === 4) {
      events.push({
        id: `ss-s2-${date}`,
        kind: "session",
        date,
        title: day % 9 === 0 ? "세션 노쇼" : "세션",
        status: day % 9 === 0 ? "no_show" : "completed",
        studentId: "s2",
        studentName: "이학생",
        mentorId: "m1",
        mentorName: "박멘토",
        startTime: "21:00",
        endTime: "22:30",
      });
    }
    if (dow === 5) {
      events.push({
        id: `ss-s3-${date}`,
        kind: "session",
        date,
        title: "세션",
        status: "completed",
        studentId: "s3",
        studentName: "박학생",
        mentorId: "m2",
        mentorName: "최멘토",
        startTime: "19:00",
        endTime: "20:30",
      });
    }
  }
  return events;
}

export default function PreviewCalendarPage() {
  const now = new Date();
  const [ym, setYm] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [added, setAdded] = useState<CalendarEvent[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const counter = useRef(0);

  const events = useMemo(() => {
    const base = [...mockMonth(ym), ...added.filter((e) => e.date.startsWith(ym))];
    return base
      .filter((e) => !removed.has(e.sourceId ?? e.id))
      .map((e) =>
        overrides[e.id] ? { ...e, status: overrides[e.id] } : e,
      );
  }, [ym, added, overrides, removed]);

  const ok = { error: null as string | null };

  return (
    <AppShell title="관리자 · 캘린더" nav={NAV} userLabel="admin@mentorang.kr">
      <CalendarBoard
        ym={ym}
        events={events}
        students={STUDENTS}
        mentors={MENTORS}
        mentorStudents={MENTOR_STUDENTS}
        role="admin"
        onNavigate={setYm}
        studentTasksBase="/preview/mentor"
        actions={{
          quickCreate: async ({ suggestion: s, date }: QuickCreatePayload) => {
            const id = `local-${++counter.current}`;
            if (s.kind === "task") {
              setAdded((a) => [
                ...a,
                {
                  id,
                  kind: "task",
                  date,
                  title: s.content,
                  subject: s.subject,
                  status: "planned",
                  studentId: s.studentId,
                  studentName: s.studentName,
                },
              ]);
            } else if (s.kind === "session") {
              setAdded((a) => [
                ...a,
                {
                  id,
                  kind: "session",
                  date,
                  title: "세션",
                  status: "completed",
                  studentId: s.studentId,
                  studentName: s.studentName,
                  mentorId: s.mentorId ?? "m1",
                  mentorName: s.mentorName ?? "박멘토",
                  startTime: s.startTime,
                  endTime: s.endTime,
                },
              ]);
            } else if (s.kind === "exception") {
              const days: CalendarEvent[] = [];
              let d = date;
              while (d <= s.endDate) {
                days.push({
                  id: `${id}-${d}`,
                  sourceId: id,
                  kind: "exception",
                  date: d,
                  title: s.reason,
                  studentId: s.studentId,
                  studentName: s.studentName,
                  spanStart: date,
                  spanEnd: s.endDate,
                });
                d = addDays(d, 1);
              }
              setAdded((a) => [...a, ...days]);
            }
            return ok;
          },
          toggleTask: async (id, done) => {
            setOverrides((o) => ({ ...o, [id]: done ? "done" : "planned" }));
            // 유기적 연결 데모: 순차(Day X-Y) 과제 완료 시 3일 뒤 복습 자동 생성
            const target = events.find((e) => e.id === id);
            if (
              done &&
              target &&
              /Day \d+-\d+$/.test(target.title) &&
              !target.linked
            ) {
              const rid = `local-${++counter.current}`;
              setAdded((a) => [
                ...a,
                {
                  id: rid,
                  kind: "task",
                  date: addDays(target.date, 3),
                  title: `${target.title} 복습`,
                  subject: target.subject,
                  status: "planned",
                  studentId: target.studentId,
                  studentName: target.studentName,
                  linked: true,
                },
              ]);
            }
            // 조건부 트리거 데모: 인강 시청 완료 시 같은 날 액션 과제 생성
            if (done && target && target.title.includes("인강 1강 시청")) {
              const rid = `local-${++counter.current}`;
              setAdded((a) => [
                ...a,
                {
                  id: rid,
                  kind: "task",
                  date: target.date,
                  title: "마플 해당 단원 문제 풀이",
                  subject: target.subject,
                  status: "planned",
                  studentId: target.studentId,
                  studentName: target.studentName,
                  linked: true,
                },
              ]);
            }
            return ok;
          },
          setSessionStatus: async (id, status) => {
            setOverrides((o) => ({ ...o, [id]: status }));
            return ok;
          },
          deleteTask: async (id) => {
            setRemoved((r) => new Set(r).add(id));
            return ok;
          },
          deleteException: async (id) => {
            setRemoved((r) => new Set(r).add(id));
            return ok;
          },
        }}
      />
    </AppShell>
  );
}
