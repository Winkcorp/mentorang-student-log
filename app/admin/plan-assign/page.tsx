import { createClient } from "@/lib/supabase/server";
import { AssignFlow } from "./AssignFlow";

export default async function PlanAssignPage() {
  const supabase = await createClient();
  const [{ data: students }, { data: templates }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("study_plan_templates")
      .select("id, name")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">계획 배정</h1>
        <p className="text-sm text-gray-500">
          학생에게 템플릿을 배정하면 기간에 맞춰 과제가 자동 생성됩니다.
          시작일은 반드시 월요일이어야 합니다.
        </p>
      </div>
      <AssignFlow students={students ?? []} templates={templates ?? []} />
    </div>
  );
}
