import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { embeddedSubjectName } from "@/lib/masters/types";
import { createClient } from "@/lib/supabase/server";
import { TaskChecklist, type TaskRow } from "@/components/TaskChecklist";

export default async function MentorStudentTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole("mentor");
  const supabase = await createClient();

  // 본인 담당 학생인지 확인 (admin은 requireRole에서 통과)
  if (profile.role === "mentor") {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("mentor_id", profile.mentor_id!)
      .eq("student_id", id)
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (!count) redirect("/mentor");
  }

  const { data: student } = await supabase
    .from("students")
    .select("id, name, school, grade")
    .eq("id", id)
    .single();

  if (!student) notFound();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, date, content, status, related_task_id, subjects(name)")
    .eq("student_id", id)
    .order("date")
    .order("created_at");

  const rows = (tasks ?? []).map((t) => ({
    ...t,
    subject: embeddedSubjectName(t.subjects),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mentor" className="text-sm text-blue-600 hover:underline">
          ← 내 학생
        </Link>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {student.name} 과제
          <span className="ml-2 text-sm font-normal text-gray-500">
            {student.school} {student.grade}
          </span>
        </h1>
      </div>
      <TaskChecklist tasks={rows as unknown as TaskRow[]} />
    </div>
  );
}
