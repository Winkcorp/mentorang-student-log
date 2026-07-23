import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [students, mentors, pendingProfiles] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("mentors")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("role", null),
  ]);

  const cards = [
    { label: "활성 학생", value: students.count ?? 0 },
    { label: "활성 멘토", value: mentors.count ?? 0 },
    { label: "승인 대기 계정", value: pendingProfiles.count ?? 0 },
  ];

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-gray-900">대시보드</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-gray-200/70 bg-white p-5"
          >
            <p className="text-sm text-gray-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
