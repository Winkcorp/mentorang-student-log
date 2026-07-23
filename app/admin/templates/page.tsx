import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createTemplate, deleteTemplate } from "./actions";

export default async function AdminTemplatesPage() {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("study_plan_templates")
    .select("id, name, duration_weeks, template_tasks(id)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          학습 계획 템플릿
        </h1>
        <p className="text-sm text-gray-500">
          템플릿을 만들고, 학생에게 배정하면 기간에 맞춰 과제가 자동
          생성됩니다. 배정은{" "}
          <Link href="/admin/plan-assign" className="text-blue-600 hover:underline">
            계획 배정
          </Link>
          에서 합니다.
        </p>
      </div>

      <form
        action={createTemplate}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            템플릿 이름 *
          </label>
          <input
            name="name"
            required
            placeholder="이과_A_4주"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            기간(주) *
          </label>
          <input
            name="durationWeeks"
            type="number"
            min="1"
            required
            defaultValue={4}
            className="w-20 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          만들기
        </button>
      </form>

      <ul className="space-y-2">
        {(templates ?? []).map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <Link
              href={`/admin/templates/${t.id}`}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              {t.name}
            </Link>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500">
                {t.duration_weeks}주 · 항목 {t.template_tasks?.length ?? 0}개
              </span>
              <form action={deleteTemplate}>
                <input type="hidden" name="id" value={t.id} />
                <button
                  type="submit"
                  className="text-xs text-red-500 hover:underline"
                >
                  삭제
                </button>
              </form>
            </div>
          </li>
        ))}
        {!templates?.length && (
          <p className="text-sm text-gray-400">템플릿이 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
