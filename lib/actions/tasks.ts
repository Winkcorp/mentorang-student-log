"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  planReactiveTask,
  type ExceptionPeriod,
  type TemplateItem,
} from "@/lib/plan/generate";

export interface ToggleResult {
  error: string | null;
  /** 반응형으로 생성된 후속 과제 내용 (UI 안내용) */
  created?: { date: string; content: string } | null;
}

/**
 * 과제 완료/취소 토글.
 *
 * done 전환 시 반응형 생성:
 *  - sequential 학습 과제 → review_lag_days 뒤 "복습" 과제 (예외 기간 회피)
 *  - conditional 트리거 → 같은 날짜 액션 과제 (예외 기간 회피)
 *  트리거 체크 전에는 액션 과제가 존재하지 않는다.
 *
 * done 해제 시: 이 과제에서 파생된 미완료(planned) 과제를 함께 제거.
 *
 * 권한: admin 전체, mentor는 담당(assignments) 학생만. parent는 읽기 전용.
 */
export async function toggleTask(
  taskId: string,
  done: boolean,
): Promise<ToggleResult> {
  const profile = await getProfile();
  if (!profile || !profile.role) return { error: "권한이 없습니다." };
  if (profile.role === "parent")
    return { error: "학부모 계정은 읽기 전용입니다." };

  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, student_id, date, subject_id, content, status, related_task_id, source_template_task_id",
    )
    .eq("id", taskId)
    .single();

  if (!task) return { error: "과제를 찾을 수 없습니다." };

  // mentor: 본인 담당 학생인지 확인 (RLS 도입 전 애플리케이션 레벨 방어)
  if (profile.role === "mentor") {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("mentor_id", profile.mentor_id!)
      .eq("student_id", task.student_id)
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (!count) return { error: "담당 학생의 과제만 변경할 수 있습니다." };
  }

  if (done && task.status !== "done") {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", taskId);
    if (error) return { error: error.message };

    const created = await createReactiveTask(supabase, task);
    revalidateTaskViews(task.student_id);
    return { error: null, created };
  }

  if (!done && task.status !== "planned") {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "planned" })
      .eq("id", taskId);
    if (error) return { error: error.message };

    // 파생된 미완료 과제 정리 (완료된 파생 과제는 이력이므로 보존)
    await supabase
      .from("tasks")
      .delete()
      .eq("related_task_id", taskId)
      .eq("status", "planned");

    revalidateTaskViews(task.student_id);
    return { error: null, created: null };
  }

  return { error: null, created: null };
}

type SupabaseClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

async function createReactiveTask(
  supabase: SupabaseClient,
  task: {
    id: string;
    student_id: string;
    date: string;
    subject_id: string;
    content: string;
    related_task_id: string | null;
    source_template_task_id: string | null;
  },
): Promise<{ date: string; content: string } | null> {
  if (!task.source_template_task_id || task.related_task_id) return null;

  const { data: item } = await supabase
    .from("template_tasks")
    .select("id, template_id, subject_id, item_type, config")
    .eq("id", task.source_template_task_id)
    .single();

  if (!item || !["sequential", "conditional"].includes(item.item_type))
    return null;

  // 중복 생성 방지 — 이미 이 과제에서 파생된 과제가 있으면 스킵
  const { count: existing } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("related_task_id", task.id);
  if (existing) return null;

  const { data: exceptions } = await supabase
    .from("exceptions")
    .select("student_id, start_date, end_date, suppress_generation")
    .or(`student_id.eq.${task.student_id},student_id.is.null`)
    .eq("suppress_generation", true);

  const reactive = planReactiveTask({
    task,
    item: item as unknown as TemplateItem,
    exceptions: (exceptions ?? []) as ExceptionPeriod[],
  });
  if (!reactive) return null;

  const { error } = await supabase.from("tasks").insert({
    student_id: task.student_id,
    date: reactive.date,
    subject_id: reactive.subject_id,
    content: reactive.content,
    status: "planned",
    source_template_id: item.template_id,
    source_template_task_id: reactive.source_template_task_id,
    related_task_id: reactive.related_task_id,
  });
  if (error) return null;

  return { date: reactive.date, content: reactive.content };
}

function revalidateTaskViews(studentId: string) {
  revalidatePath(`/admin/students/${studentId}/tasks`);
  revalidatePath(`/mentor/students/${studentId}/tasks`);
  revalidatePath("/parent");
}
