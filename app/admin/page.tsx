import Link from "next/link";
import { daysAgoTimestamp, daysSince } from "@/lib/dates";
import { byId, loadMasters } from "@/lib/masters/load";
import { createClient } from "@/lib/supabase/server";

/** 후보 상태로 이 일수 이상 방치되면 대시보드에 띄운다 */
const STALE_CANDIDATE_DAYS = 7;

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const staleBefore = daysAgoTimestamp(STALE_CANDIDATE_DAYS);

  const [students, mentors, pendingProfiles, staleCandidates, masters] =
    await Promise.all([
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
      supabase
        .from("assignments")
        .select(
          "id, session_type_id, subject_id, created_at, memo, students(name), mentors(name)",
        )
        .eq("status", "candidate")
        .lte("created_at", staleBefore)
        .order("created_at"),
      loadMasters(),
    ]);

  const sessionTypeById = byId(masters.sessionTypes);
  const subjectById = byId(masters.subjects);
  const stale = staleCandidates.data ?? [];

  const cards = [
    { label: "활성 학생", value: students.count ?? 0 },
    { label: "활성 멘토", value: mentors.count ?? 0 },
    { label: "승인 대기 계정", value: pendingProfiles.count ?? 0 },
    { label: "미확정 배정", value: stale.length, alert: stale.length > 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-xl font-bold text-gray-900">대시보드</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className={`rounded-2xl border p-5 ${
                c.alert
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-200/70 bg-white"
              }`}
            >
              <p className="text-sm text-gray-500">{c.label}</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  c.alert ? "text-amber-800" : "text-gray-900"
                }`}
              >
                {c.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {stale.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            미확정 배정 ({stale.length})
          </h2>
          <p className="mb-3 text-sm text-gray-500">
            후보 상태로 {STALE_CANDIDATE_DAYS}일 이상 방치된 배정입니다. 확정하지
            않으면 세션 시리즈를 만들 수 없습니다.
          </p>
          <ul className="space-y-2">
            {stale.map((a) => {
              const type = a.session_type_id
                ? sessionTypeById.get(a.session_type_id)
                : null;
              const subject = a.subject_id
                ? subjectById.get(a.subject_id)
                : null;
              const days = daysSince(a.created_at);
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
                >
                  <span className="font-medium text-gray-900">
                    {relName(a.students)}
                  </span>
                  <span className="text-gray-400">←</span>
                  <span className="text-gray-700">{relName(a.mentors)}</span>
                  <span className="text-gray-600">{type?.name ?? "-"}</span>
                  {subject && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: subject.color }}
                    >
                      {subject.name}
                    </span>
                  )}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {days}일 방치
                  </span>
                  {a.memo && (
                    <span className="text-xs text-gray-400">“{a.memo}”</span>
                  )}
                  <Link
                    href="/admin/assignments"
                    className="ml-auto text-xs text-blue-600 hover:underline"
                  >
                    검토 →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
