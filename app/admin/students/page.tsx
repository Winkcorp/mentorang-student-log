import { createClient } from "@/lib/supabase/server";
import { createStudent, toggleStudentStatus } from "./actions";

export default async function AdminStudentsPage() {
  const supabase = await createClient();
  const [{ data: students }, { data: parents }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, school, grade, status, parents(id, name)")
      .order("status")
      .order("name"),
    supabase.from("parents").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">학생 관리</h1>

      <form
        action={createStudent}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            이름 *
          </label>
          <input
            name="name"
            required
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학교
          </label>
          <input
            name="school"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학년
          </label>
          <input
            name="grade"
            placeholder="고2"
            className="w-20 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학부모
          </label>
          <select
            name="parentId"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">선택 안 함</option>
            {(parents ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          등록
        </button>
      </form>

      <ul className="space-y-2">
        {(students ?? []).map((s) => {
          const parent = Array.isArray(s.parents) ? s.parents[0] : s.parents;
          return (
            <li
              key={s.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 ${
                s.status === "active" ? "bg-white" : "bg-gray-100 opacity-60"
              }`}
            >
              <div>
                <span className="text-sm font-medium text-gray-900">
                  {s.name}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {s.school} {s.grade}
                </span>
                {parent && (
                  <span className="ml-2 text-xs text-gray-400">
                    학부모: {parent.name}
                  </span>
                )}
              </div>
              <form action={toggleStudentStatus}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="current" value={s.status} />
                <button
                  type="submit"
                  className="text-xs text-gray-500 hover:underline"
                >
                  {s.status === "active" ? "비활성화" : "활성화"}
                </button>
              </form>
            </li>
          );
        })}
        {!students?.length && (
          <p className="text-sm text-gray-400">등록된 학생이 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
