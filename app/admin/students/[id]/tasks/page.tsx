import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskChecklist, type TaskRow } from "@/components/TaskChecklist";

export default async function AdminStudentTasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, name, school, grade")
    .eq("id", id)
    .single();

  if (!student) notFound();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, date, subject, content, status, related_task_id")
    .eq("student_id", id)
    .order("date")
    .order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/students"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 학생 목록
        </Link>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {student.name} 과제
          <span className="ml-2 text-sm font-normal text-gray-500">
            {student.school} {student.grade}
          </span>
        </h1>
      </div>
      <TaskChecklist tasks={(tasks ?? []) as TaskRow[]} />
    </div>
  );
}
