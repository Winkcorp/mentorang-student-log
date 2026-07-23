import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentWeekRange } from "@/lib/dates";
import { DAY_LABEL, DAY_OF_WEEK } from "@/lib/plan/config";

const SESSION_STATUS_LABEL: Record<string, string> = {
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

function dayLabel(date: string) {
  const idx = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return DAY_LABEL[DAY_OF_WEEK[idx]];
}

/**
 * 학부모 홈 — 이번 주 과제(계획/완료), 완료율, 담당 멘토 이름, 세션 일정.
 *
 * 모든 조회는 anon key + 세션 쿠키(RLS 적용)로만 이루어진다.
 * sessions는 notes를 제외한 parent_sessions_view, 멘토는 이름·과목만
 * 노출하는 parent_mentors_view를 사용한다 — service_role 우회 경로 없음.
 */
export default async function ParentHomePage() {
  const profile = await requireRole("parent");
  const supabase = await createClient();
  const { monday, sunday } = currentWeekRange();

  // 본인 자녀만 (RLS + 명시적 필터 이중 방어)
  const { data: children } = await supabase
    .from("students")
    .select("id, name, school, grade")
    .eq("parent_id", profile.parent_id!)
    .eq("status", "active")
    .order("name");

  const childIds = (children ?? []).map((c) => c.id);

  const [{ data: tasks }, { data: assignments }, { data: mentorNames }, { data: sessions }] =
    childIds.length
      ? await Promise.all([
          supabase
            .from("tasks")
            .select("id, student_id, date, subject, content, status")
            .in("student_id", childIds)
            .gte("date", monday)
            .lte("date", sunday)
            .order("date"),
          supabase
            .from("assignments")
            .select("student_id, mentor_id, subject, end_date")
            .in("student_id", childIds),
          supabase.from("parent_mentors_view").select("id, name"),
          supabase
            .from("parent_sessions_view")
            .select("id, student_id, date, start_time, end_time, status")
            .in("student_id", childIds)
            .gte("date", monday)
            .lte("date", sunday)
            .order("date"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const mentorNameById = new Map(
    (mentorNames ?? []).map((m) => [m.id, m.name]),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">이번 주 학습</h1>
        <p className="text-sm text-gray-500">
          {monday} ~ {sunday}
        </p>
      </div>

      {!children?.length && (
        <p className="text-sm text-gray-400">연결된 자녀 정보가 없습니다.</p>
      )}

      {(children ?? []).map((child) => {
        const childTasks = (tasks ?? []).filter(
          (t) => t.student_id === child.id,
        );
        const doneCount = childTasks.filter((t) => t.status === "done").length;
        const rate =
          childTasks.length > 0
            ? Math.round((doneCount / childTasks.length) * 100)
            : null;
        const childMentors = (assignments ?? [])
          .filter((a) => a.student_id === child.id && !a.end_date)
          .map((a) => ({
            name: mentorNameById.get(a.mentor_id) ?? "―",
            subject: a.subject,
          }));
        const childSessions = (sessions ?? []).filter(
          (s) => s.student_id === child.id,
        );

        const byDate = new Map<string, typeof childTasks>();
        for (const t of childTasks) {
          if (!byDate.has(t.date)) byDate.set(t.date, []);
          byDate.get(t.date)!.push(t);
        }

        return (
          <section
            key={child.id}
            className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900">
                {child.name}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {child.school} {child.grade}
                </span>
              </h2>
              {rate !== null && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-blue-700">
                    {rate}%
                  </span>
                </div>
              )}
            </div>

            {childMentors.length > 0 && (
              <p className="text-sm text-gray-600">
                담당 멘토:{" "}
                {childMentors.map((m, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    <b>{m.name}</b> ({m.subject})
                  </span>
                ))}
              </p>
            )}

            {childSessions.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-gray-700">
                  이번 주 세션
                </h3>
                <ul className="space-y-1 text-sm text-gray-600">
                  {childSessions.map((s) => (
                    <li key={s.id}>
                      {s.date} ({dayLabel(s.date)}){" "}
                      {String(s.start_time).slice(0, 5)}~
                      {String(s.end_time).slice(0, 5)}
                      <span className="ml-1 text-xs text-gray-400">
                        {SESSION_STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-sm font-semibold text-gray-700">
                과제 ({doneCount}/{childTasks.length})
              </h3>
              {childTasks.length === 0 ? (
                <p className="text-sm text-gray-400">
                  이번 주 과제가 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {[...byDate.keys()].sort().map((date) => (
                    <div key={date}>
                      <p className="text-xs font-medium text-gray-500">
                        {date} ({dayLabel(date)})
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {byDate.get(date)!.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              className={
                                t.status === "done"
                                  ? "text-green-600"
                                  : "text-gray-300"
                              }
                            >
                              {t.status === "done" ? "✓" : "○"}
                            </span>
                            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                              {t.subject}
                            </span>
                            <span
                              className={
                                t.status === "done"
                                  ? "text-gray-400 line-through"
                                  : "text-gray-800"
                              }
                            >
                              {t.content}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
