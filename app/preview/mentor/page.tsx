"use client";

import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";

/** 미리보기 — 과제 체크(복습 자동 생성), 세션 상태 변경, 대체수업이 로컬로 동작. */

const NAV = [
  { href: "/preview/mentor", label: "내 학생 · 세션" },
  { href: "/preview/calendar", label: "캘린더" },
];

interface Task {
  id: string;
  date: string;
  subject: string;
  content: string;
  done: boolean;
  linked: boolean;
}

interface Session {
  id: string;
  student: string;
  when: string;
  status: "완료" | "노쇼" | "취소" | "대체수업";
  note?: string;
  makeupOf?: string;
}

const STATUS_STYLE: Record<Session["status"], string> = {
  완료: "bg-green-50 text-green-700",
  노쇼: "bg-red-50 text-red-700",
  취소: "bg-gray-100 text-gray-500",
  대체수업: "bg-purple-50 text-purple-700",
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function PreviewMentorPage() {
  const counter = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([
    { id: "t1", date: "2026-08-03", subject: "국어", content: "강기본 하루 2강씩", done: true, linked: false },
    { id: "t2", date: "2026-08-03", subject: "영어", content: "Day 25-27", done: false, linked: false },
    { id: "t3", date: "2026-08-03", subject: "수학", content: "수1 인강 1강 시청", done: false, linked: false },
    { id: "t4", date: "2026-08-04", subject: "국어", content: "강기본 하루 2강씩", done: false, linked: false },
  ]);
  const [sessions, setSessions] = useState<Session[]>([
    { id: "s1", student: "김학생", when: "2026-08-03 19:00~21:00", status: "완료" },
    { id: "s2", student: "이학생", when: "2026-08-03 21:00~22:30", status: "노쇼" },
    { id: "s3", student: "이학생", when: "2026-08-04 21:00~22:30", status: "취소" },
  ]);

  function toggleTask(t: Task) {
    const done = !t.done;
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done } : x)));
    setNotice(null);

    if (done && !t.linked) {
      // 순차 학습 → 복습 자동 생성
      if (/Day \d+-\d+$/.test(t.content)) {
        const date = addDays(t.date, 3);
        setTasks((list) => [
          ...list,
          { id: `r${++counter.current}`, date, subject: t.subject, content: `${t.content} 복습`, done: false, linked: true },
        ]);
        setNotice(`후속 과제가 생성되었습니다: ${date} — ${t.content} 복습`);
      }
      // 조건부 트리거 → 액션 생성
      if (t.content.includes("인강 1강 시청")) {
        setTasks((list) => [
          ...list,
          { id: `a${++counter.current}`, date: t.date, subject: t.subject, content: "마플 해당 단원 문제 풀이", done: false, linked: true },
        ]);
        setNotice(`후속 과제가 생성되었습니다: ${t.date} — 마플 해당 단원 문제 풀이`);
      }
    }
    if (!done) {
      // 완료 취소 시 파생된 미완료 과제 제거 (실제 동작과 동일)
      setTasks((list) =>
        list.filter((x) => !(x.linked && !x.done && x.content.startsWith(t.content))),
      );
    }
  }

  function setSessionStatus(id: string, status: Session["status"]) {
    setSessions((list) => list.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  function addMakeup(orig: Session) {
    setSessions((list) => [
      ...list,
      {
        id: `m${++counter.current}`,
        student: orig.student,
        when: `${addDays(orig.when.slice(0, 10), 1)} ${orig.when.slice(11)}`,
        status: "대체수업",
        makeupOf: orig.id,
      },
    ]);
  }

  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date)!.push(t);
  }

  return (
    <AppShell title="멘토" nav={NAV} userLabel="mentor@mentorang.kr">
      <div className="space-y-8">
        <section>
          <h1 className="mb-4 text-xl font-bold text-gray-900">
            김학생 과제
            <span className="ml-2 text-sm font-normal text-gray-500">한국고 고2</span>
          </h1>
          {notice && (
            <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {notice}
            </div>
          )}
          <div className="space-y-4">
            {[...byDate.keys()].sort().map((date) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">{date}</h3>
                <ul className="space-y-1">
                  {byDate.get(date)!.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => toggleTask(t)}
                        className="h-4 w-4"
                      />
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {t.subject}
                      </span>
                      <span className={`text-sm ${t.done ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {t.content}
                      </span>
                      {t.linked && (
                        <span className="ml-auto rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                          연계
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            💡 &quot;Day 25-27&quot;을 체크하면 3일 뒤 복습이, &quot;인강 1강
            시청&quot;을 체크하면 같은 날 액션 과제가 자동 생성됩니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">세션 관리</h2>
          <ul className="space-y-2">
            {sessions.map((s) => {
              const hasMakeup = sessions.some((x) => x.makeupOf === s.id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
                >
                  <div className="text-sm text-gray-900">
                    <span className="font-medium">{s.student}</span>
                    <span className="ml-2 text-gray-600">{s.when}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>
                      {s.status}
                    </span>
                    {s.makeupOf && (
                      <span className="ml-1 text-xs text-gray-400">(원 세션 연결됨)</span>
                    )}
                    {hasMakeup && (
                      <span className="ml-1 text-xs text-purple-500">대체수업 있음</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.status !== "대체수업" &&
                      (["완료", "노쇼", "취소"] as const)
                        .filter((x) => x !== s.status)
                        .map((x) => (
                          <button
                            key={x}
                            onClick={() => setSessionStatus(s.id, x)}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            {x}로 변경
                          </button>
                        ))}
                    {s.status === "취소" && !hasMakeup && (
                      <button
                        onClick={() => addMakeup(s)}
                        className="rounded-lg bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-700"
                      >
                        대체수업 등록
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
