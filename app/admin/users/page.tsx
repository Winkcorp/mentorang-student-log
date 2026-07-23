import { createClient } from "@/lib/supabase/server";
import { RoleAssignForm } from "./RoleAssignForm";
import { revokeRole } from "./actions";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const [{ data: profiles }, { data: mentors }, { data: parents }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, role, mentor_id, parent_id, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("mentors")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase.from("parents").select("id, name").order("name"),
    ]);

  const pending = (profiles ?? []).filter((p) => !p.role);
  const approved = (profiles ?? []).filter((p) => p.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">계정 승인</h1>
        <p className="text-sm text-gray-500">
          가입한 계정에 역할을 부여하세요. mentor/parent는 기존 멘토·학부모
          데이터와 연결해야 합니다.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          승인 대기 ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-400">대기 중인 계정이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white p-4"
              >
                <span className="text-sm font-medium text-gray-900">
                  {p.email}
                </span>
                <RoleAssignForm
                  profileId={p.id}
                  mentors={mentors ?? []}
                  parents={parents ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          승인된 계정 ({approved.length})
        </h2>
        <ul className="space-y-2">
          {approved.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-900">{p.email}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {p.role}
                </span>
              </div>
              <form
                action={async (formData) => {
                  "use server";
                  await revokeRole(formData);
                }}
              >
                <input type="hidden" name="profileId" value={p.id} />
                <button
                  type="submit"
                  className="text-sm text-red-500 hover:underline"
                >
                  역할 회수
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
