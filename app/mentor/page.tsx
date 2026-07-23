import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MentorHomePage() {
  const profile = await requireRole("mentor");
  const supabase = await createClient();

  // 본인이 담당한(assignments 기준) 학생 목록
  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, subject, start_date, end_date, students(id, name, school, grade)")
    .eq("mentor_id", profile.mentor_id!)
    .order("start_date", { ascending: false });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-gray-900">내 학생</h1>
      {!assignments?.length ? (
        <p className="text-sm text-gray-400">담당 중인 학생이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const student = Array.isArray(a.students)
              ? a.students[0]
              : a.students;
            return (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {student?.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {student?.school} {student?.grade}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {a.subject}
                  </span>
                  <Link
                    href={`/mentor/students/${student?.id}/tasks`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    과제 보기
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
