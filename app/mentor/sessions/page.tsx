import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createMakeupSession,
  createSession,
  updateSessionStatus,
} from "./actions";

const STATUS_LABEL: Record<string, string> = {
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-green-50 text-green-700",
  no_show: "bg-red-50 text-red-700",
  canceled: "bg-gray-100 text-gray-500",
  makeup: "bg-purple-50 text-purple-700",
};

const inputCls = "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";

export default async function MentorSessionsPage() {
  const profile = await requireRole("mentor");
  const supabase = await createClient();

  const [{ data: sessions }, { data: assignments }] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id, date, start_time, end_time, status, notes, related_session_id, students(id, name)",
      )
      .order("date", { ascending: false })
      .order("start_time")
      .limit(100),
    profile.mentor_id
      ? supabase
          .from("assignments")
          .select("student_id, students(id, name)")
          .eq("mentor_id", profile.mentor_id)
          .is("end_date", null)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const students = new Map<string, string>();
  for (const a of assignments ?? []) {
    const s = Array.isArray(a.students) ? a.students[0] : a.students;
    if (s) students.set(s.id, s.name);
  }

  // 이미 대체수업이 연결된 원 세션 id
  const replacedIds = new Set(
    (sessions ?? [])
      .filter((s) => s.status === "makeup" && s.related_session_id)
      .map((s) => s.related_session_id as string),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">세션 관리</h1>
        <p className="text-sm text-gray-500">
          진행한 세션을 기록하고, 노쇼/취소를 체크하세요. 취소 세션은
          대체수업을 연결할 수 있습니다.
        </p>
      </div>

      <form
        action={createSession}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/70 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학생 *
          </label>
          <select name="studentId" required className={inputCls}>
            <option value="">선택</option>
            {[...students.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            날짜 *
          </label>
          <input name="date" type="date" required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            시작 *
          </label>
          <input name="startTime" type="time" required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            종료 *
          </label>
          <input name="endTime" type="time" required className={inputCls} />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          세션 기록
        </button>
      </form>

      <ul className="space-y-2">
        {(sessions ?? []).map((s) => {
          const student = Array.isArray(s.students)
            ? s.students[0]
            : s.students;
          return (
            <li
              key={s.id}
              className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{student?.name}</span>
                  <span className="ml-2 text-gray-600">
                    {s.date} {String(s.start_time).slice(0, 5)}~
                    {String(s.end_time).slice(0, 5)}
                  </span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                  {s.related_session_id && (
                    <span className="ml-1 text-xs text-gray-400">
                      (원 세션 연결됨)
                    </span>
                  )}
                  {replacedIds.has(s.id) && (
                    <span className="ml-1 text-xs text-purple-500">
                      대체수업 있음
                    </span>
                  )}
                </div>

                {s.status !== "makeup" && (
                  <div className="flex items-center gap-1">
                    {(["completed", "no_show", "canceled"] as const)
                      .filter((st) => st !== s.status)
                      .map((st) => (
                        <form key={st} action={updateSessionStatus}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="status" value={st} />
                          <button
                            type="submit"
                            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            {STATUS_LABEL[st]}로 변경
                          </button>
                        </form>
                      ))}
                  </div>
                )}
              </div>

              {s.status === "canceled" && !replacedIds.has(s.id) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-purple-600 hover:underline">
                    대체수업 만들기
                  </summary>
                  <form
                    action={createMakeupSession}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="originalId" value={s.id} />
                    <input
                      name="date"
                      type="date"
                      required
                      className={inputCls}
                    />
                    <input
                      name="startTime"
                      type="time"
                      required
                      defaultValue={String(s.start_time).slice(0, 5)}
                      className={inputCls}
                    />
                    <input
                      name="endTime"
                      type="time"
                      required
                      defaultValue={String(s.end_time).slice(0, 5)}
                      className={inputCls}
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                    >
                      대체수업 등록
                    </button>
                  </form>
                </details>
              )}
            </li>
          );
        })}
        {!sessions?.length && (
          <p className="text-sm text-gray-400">기록된 세션이 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
