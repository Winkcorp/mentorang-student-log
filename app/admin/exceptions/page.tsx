import { createClient } from "@/lib/supabase/server";
import { createException, deleteException } from "./actions";

export default async function AdminExceptionsPage() {
  const supabase = await createClient();
  const [{ data: exceptions }, { data: students }] = await Promise.all([
    supabase
      .from("exceptions")
      .select("id, start_date, end_date, reason, suppress_generation, students(id, name)")
      .order("start_date", { ascending: false }),
    supabase
      .from("students")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">예외 일정</h1>
        <p className="text-sm text-gray-500">
          가족여행 등 개인 일정 기간엔 매일 반복·순차 과제 생성을 건너뜁니다.
          학생을 비우면 학원 전체에 적용됩니다.
        </p>
      </div>

      <form
        action={createException}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학생
          </label>
          <select
            name="studentId"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">전체 (학원 단위)</option>
            {(students ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            시작일 *
          </label>
          <input
            name="startDate"
            type="date"
            required
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            종료일 *
          </label>
          <input
            name="endDate"
            type="date"
            required
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            사유
          </label>
          <input
            name="reason"
            placeholder="가족여행"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          등록
        </button>
      </form>

      <ul className="space-y-2">
        {(exceptions ?? []).map((e) => {
          const student = Array.isArray(e.students)
            ? e.students[0]
            : e.students;
          return (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <div className="text-sm text-gray-900">
                <span className="font-medium">
                  {student?.name ?? "전체"}
                </span>
                <span className="ml-2 text-gray-600">
                  {e.start_date} ~ {e.end_date}
                </span>
                {e.reason && (
                  <span className="ml-2 text-xs text-gray-400">{e.reason}</span>
                )}
              </div>
              <form action={deleteException}>
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  className="text-xs text-red-500 hover:underline"
                >
                  삭제
                </button>
              </form>
            </li>
          );
        })}
        {!exceptions?.length && (
          <p className="text-sm text-gray-400">등록된 예외 일정이 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
