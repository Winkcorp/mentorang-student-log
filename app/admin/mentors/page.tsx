import { createClient } from "@/lib/supabase/server";
import { createMentor, toggleMentorStatus } from "./actions";

const RATE_TYPE_LABEL: Record<string, string> = {
  hourly: "시급",
  per_session: "회당",
  flat: "고정",
};

export default async function AdminMentorsPage() {
  const supabase = await createClient();
  const { data: mentors } = await supabase
    .from("mentors")
    .select("id, name, subjects, rate_type, rate_amount, status")
    .order("status")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">멘토 관리</h1>

      <form
        action={createMentor}
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
            과목 (쉼표 구분)
          </label>
          <input
            name="subjects"
            placeholder="국어, 영어"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            정산 방식 *
          </label>
          <select
            name="rateType"
            required
            className="rounded-xl border border-gray-200 px-2 py-2 text-sm"
          >
            <option value="hourly">시급</option>
            <option value="per_session">회당</option>
            <option value="flat">고정</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            단가(원) *
          </label>
          <input
            name="rateAmount"
            type="number"
            min="0"
            step="0.01"
            required
            className="w-32 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
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
        {(mentors ?? []).map((m) => (
          <li
            key={m.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 ${
              m.status === "active" ? "bg-white" : "bg-gray-100 opacity-60"
            }`}
          >
            <div>
              <span className="text-sm font-medium text-gray-900">
                {m.name}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {(m.subjects ?? []).join(" · ")}
              </span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {RATE_TYPE_LABEL[m.rate_type]}{" "}
                {Number(m.rate_amount).toLocaleString()}원
              </span>
            </div>
            <form action={toggleMentorStatus}>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="current" value={m.status} />
              <button
                type="submit"
                className="text-xs text-gray-500 hover:underline"
              >
                {m.status === "active" ? "비활성화" : "활성화"}
              </button>
            </form>
          </li>
        ))}
        {!mentors?.length && (
          <p className="text-sm text-gray-400">등록된 멘토가 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
