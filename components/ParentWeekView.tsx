import Link from "next/link";

/**
 * 학부모용 주간 학습 뷰 — 읽기 전용.
 * 자녀별 카드: 완료율 + 담당 멘토 + 월~일 7열 그리드(세션·과제).
 * 실제 페이지는 링크(?week=)로, 미리보기는 그대로 렌더만.
 */

export interface WeekTask {
  id: string;
  subject: string;
  content: string;
  done: boolean;
  linked?: boolean;
}

export interface WeekSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  mentorName?: string | null;
}

export interface ChildWeek {
  id: string;
  name: string;
  school?: string | null;
  grade?: string | null;
  mentors: { name: string; subject: string }[];
  /** 월~일 7개 */
  days: { date: string; tasks: WeekTask[]; sessions: WeekSession[] }[];
}

const DAY_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];

const SESSION_LABEL: Record<string, string> = {
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체",
};

export function ParentWeekView({
  monday,
  sunday,
  today,
  childrenWeeks,
  prevHref,
  nextHref,
  todayHref,
}: {
  monday: string;
  sunday: string;
  today: string;
  childrenWeeks: ChildWeek[];
  prevHref?: string;
  nextHref?: string;
  todayHref?: string;
}) {
  const navCls =
    "flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">
            주간 학습
          </h1>
          <p className="text-xs text-gray-400">
            {monday} ~ {sunday}
          </p>
        </div>
        {prevHref && nextHref && todayHref && (
          <div className="flex items-center gap-1.5">
            <Link className={navCls} href={prevHref}>
              ← 지난주
            </Link>
            <Link className={navCls} href={todayHref}>
              이번 주
            </Link>
            <Link className={navCls} href={nextHref}>
              다음주 →
            </Link>
          </div>
        )}
      </div>

      {childrenWeeks.length === 0 && (
        <p className="rounded-2xl border border-gray-200/70 bg-white px-4 py-10 text-center text-sm text-gray-400">
          연결된 자녀 정보가 없습니다.
        </p>
      )}

      {childrenWeeks.map((child) => {
        const allTasks = child.days.flatMap((d) => d.tasks);
        const done = allTasks.filter((t) => t.done).length;
        const rate =
          allTasks.length > 0 ? Math.round((done / allTasks.length) * 100) : null;

        return (
          <section
            key={child.id}
            className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white"
          >
            {/* 자녀 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {child.name}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {child.school} {child.grade}
                  </span>
                </h2>
                {child.mentors.length > 0 && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    담당 멘토:{" "}
                    {child.mentors.map((m, i) => (
                      <span key={i}>
                        {i > 0 && ", "}
                        <b>{m.name}</b> ({m.subject})
                      </span>
                    ))}
                  </p>
                )}
              </div>
              {rate !== null && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-36 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gray-900 transition-all"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-900">{rate}%</span>
                  <span className="text-[11px] text-gray-400">
                    {done}/{allTasks.length}
                  </span>
                </div>
              )}
            </div>

            {/* 주간 그리드 */}
            <div className="overflow-x-auto">
              <div className="grid min-w-[860px] grid-cols-7">
                {child.days.map((day, i) => {
                  const isToday = day.date === today;
                  return (
                    <div
                      key={day.date}
                      className={`min-h-[190px] border-r border-gray-100 last:border-r-0 ${
                        isToday ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <div
                        className={`border-b border-gray-100 px-2 py-1.5 text-center ${
                          isToday ? "bg-blue-50" : "bg-gray-50/60"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-semibold ${
                            i >= 5 ? "text-rose-400" : "text-gray-400"
                          }`}
                        >
                          {DAY_HEADERS[i]}
                        </span>
                        <span
                          className={`ml-1 text-xs font-bold ${
                            isToday ? "text-blue-600" : "text-gray-700"
                          }`}
                        >
                          {Number(day.date.slice(8, 10))}
                        </span>
                      </div>
                      <div className="space-y-1 p-1.5">
                        {day.sessions.map((s) => (
                          <div
                            key={s.id}
                            className={`rounded-md bg-violet-50 px-1.5 py-1 text-[11px] font-medium text-violet-700 ${
                              s.status === "canceled" ? "opacity-40 line-through" : ""
                            }`}
                          >
                            📅 {s.startTime.slice(0, 5)}~{s.endTime.slice(0, 5)}
                            {s.mentorName && (
                              <span className="font-normal"> {s.mentorName}</span>
                            )}
                            {s.status !== "completed" && (
                              <span className="font-normal">
                                {" "}
                                ({SESSION_LABEL[s.status] ?? s.status})
                              </span>
                            )}
                          </div>
                        ))}
                        {day.tasks.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-start gap-1 px-0.5 text-xs leading-snug"
                          >
                            <span
                              className={`mt-px shrink-0 ${
                                t.done ? "text-emerald-500" : "text-gray-300"
                              }`}
                            >
                              {t.done ? "✓" : "○"}
                            </span>
                            <span className="min-w-0">
                              <span className="mr-1 text-[10px] font-semibold text-gray-400">
                                {t.subject}
                              </span>
                              <span
                                className={
                                  t.done
                                    ? "text-gray-300 line-through"
                                    : "text-gray-700"
                                }
                              >
                                {t.content}
                              </span>
                            </span>
                          </div>
                        ))}
                        {day.tasks.length === 0 && day.sessions.length === 0 && (
                          <p className="px-1 pt-2 text-center text-[10px] text-gray-200">
                            ―
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
