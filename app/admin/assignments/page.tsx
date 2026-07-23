import { createClient } from "@/lib/supabase/server";
import { createAssignment, endAssignment } from "./actions";

export default async function AdminAssignmentsPage() {
  const supabase = await createClient();
  const [{ data: assignments }, { data: students }, { data: mentors }] =
    await Promise.all([
      supabase
        .from("assignments")
        .select(
          "id, subject, start_date, end_date, students(id, name), mentors(id, name)",
        )
        .order("start_date", { ascending: false }),
      supabase
        .from("students")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("mentors")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
    ]);

  const active = (assignments ?? []).filter((a) => !a.end_date);
  const ended = (assignments ?? []).filter((a) => a.end_date);

  const name = (rel: { name: string } | { name: string }[] | null) =>
    Array.isArray(rel) ? rel[0]?.name : rel?.name;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">배정 관리</h1>

      <form
        action={createAssignment}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/70 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학생 *
          </label>
          <select
            name="studentId"
            required
            className="rounded-xl border border-gray-200 px-2 py-2 text-sm"
          >
            <option value="">선택</option>
            {(students ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            멘토 *
          </label>
          <select
            name="mentorId"
            required
            className="rounded-xl border border-gray-200 px-2 py-2 text-sm"
          >
            <option value="">선택</option>
            {(mentors ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            과목 *
          </label>
          <input
            name="subject"
            required
            placeholder="국어"
            className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            시작일 *
          </label>
          <input
            name="startDate"
            type="date"
            required
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          배정
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          진행 중 ({active.length})
        </h2>
        <ul className="space-y-2">
          {active.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
            >
              <div className="text-sm text-gray-900">
                <span className="font-medium">{name(a.students)}</span>
                <span className="mx-2 text-gray-400">←</span>
                <span>{name(a.mentors)}</span>
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  {a.subject}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  {a.start_date}~
                </span>
              </div>
              <form action={endAssignment}>
                <input type="hidden" name="id" value={a.id} />
                <button
                  type="submit"
                  className="text-xs text-red-500 hover:underline"
                >
                  담당 종료
                </button>
              </form>
            </li>
          ))}
          {!active.length && (
            <p className="text-sm text-gray-400">진행 중인 배정이 없습니다.</p>
          )}
        </ul>
      </section>

      {ended.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            종료됨 ({ended.length})
          </h2>
          <ul className="space-y-2">
            {ended.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-500 opacity-70"
              >
                {name(a.students)} ← {name(a.mentors)} · {a.subject} ·{" "}
                {a.start_date} ~ {a.end_date}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
