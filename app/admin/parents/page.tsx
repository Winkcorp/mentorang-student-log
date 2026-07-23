import { createClient } from "@/lib/supabase/server";
import { createParent } from "./actions";

export default async function AdminParentsPage() {
  const supabase = await createClient();
  const { data: parents } = await supabase
    .from("parents")
    .select("id, name, contact, students(id, name)")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">학부모 관리</h1>

      <form
        action={createParent}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/70 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            이름 *
          </label>
          <input
            name="name"
            required
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            연락처
          </label>
          <input
            name="contact"
            placeholder="010-0000-0000"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          등록
        </button>
      </form>

      <ul className="space-y-2">
        {(parents ?? []).map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
          >
            <div>
              <span className="text-sm font-medium text-gray-900">
                {p.name}
              </span>
              {p.contact && (
                <span className="ml-2 text-xs text-gray-500">{p.contact}</span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              자녀:{" "}
              {p.students?.length
                ? p.students.map((s) => s.name).join(", ")
                : "없음"}
            </span>
          </li>
        ))}
        {!parents?.length && (
          <p className="text-sm text-gray-400">등록된 학부모가 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
