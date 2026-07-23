"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  generatePlanTasks,
  isExcludedDate,
  isMonday,
  periodDates,
  type ExceptionPeriod,
  type TemplateItem,
} from "@/lib/plan/generate";

export interface AssignCheckResult {
  error: string | null;
  durationWeeks?: number;
  periodEnd?: string;
  /** 기간과 겹치는 기존 tasks 수 */
  overlapCount?: number;
  /** 기간 중 생성이 제외될 예외 날짜들 */
  exceptionDates?: string[];
  /** 생성될 과제 수 (예외 제외 반영) */
  previewCount?: number;
}

async function loadAssignContext(
  studentId: string,
  templateId: string,
  startDate: string,
) {
  const supabase = await createClient();

  const [{ data: template }, { data: items }, { data: student }] =
    await Promise.all([
      supabase
        .from("study_plan_templates")
        .select("id, name, duration_weeks")
        .eq("id", templateId)
        .single(),
      supabase
        .from("template_tasks")
        .select("id, subject, item_type, config")
        .eq("template_id", templateId),
      supabase
        .from("students")
        .select("id, name")
        .eq("id", studentId)
        .single(),
    ]);

  if (!template || !student) return null;

  const periodEnd = periodDates(startDate, template.duration_weeks).at(-1)!;

  const { data: exceptions } = await supabase
    .from("exceptions")
    .select("student_id, start_date, end_date, suppress_generation")
    .or(`student_id.eq.${studentId},student_id.is.null`)
    .lte("start_date", periodEnd)
    .gte("end_date", startDate);

  return {
    supabase,
    template,
    items: (items ?? []) as TemplateItem[],
    periodEnd,
    exceptions: (exceptions ?? []) as ExceptionPeriod[],
  };
}

/**
 * 배정 전 사전 점검 — 시작일 월요일 검증, 기존 tasks 겹침, 예외 기간 감지.
 */
export async function checkPlanAssignment(
  studentId: string,
  templateId: string,
  startDate: string,
): Promise<AssignCheckResult> {
  await requireRole("admin");

  if (!studentId || !templateId || !startDate)
    return { error: "학생·템플릿·시작일을 모두 선택하세요." };

  if (!isMonday(startDate))
    return { error: "시작일은 항상 월요일이어야 합니다." };

  const ctx = await loadAssignContext(studentId, templateId, startDate);
  if (!ctx) return { error: "학생 또는 템플릿을 찾을 수 없습니다." };
  if (ctx.items.length === 0)
    return { error: "템플릿에 학습 항목이 없습니다. 항목을 먼저 추가하세요." };

  const { count: overlapCount } = await ctx.supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .gte("date", startDate)
    .lte("date", ctx.periodEnd);

  const exceptionDates = periodDates(
    startDate,
    ctx.template.duration_weeks,
  ).filter((d) => isExcludedDate(d, studentId, ctx.exceptions));

  const previewCount = generatePlanTasks({
    studentId,
    startDate,
    durationWeeks: ctx.template.duration_weeks,
    items: ctx.items,
    exceptions: ctx.exceptions,
  }).length;

  return {
    error: null,
    durationWeeks: ctx.template.duration_weeks,
    periodEnd: ctx.periodEnd,
    overlapCount: overlapCount ?? 0,
    exceptionDates,
    previewCount,
  };
}

export interface AssignApplyResult {
  error: string | null;
  inserted?: number;
  deleted?: number;
}

/**
 * 배정 실행 — 템플릿 항목별 tasks 생성.
 *
 * overwrite=true면 기간 내 기존 "planned" tasks를 삭제 후 생성
 * (done 처리된 이력은 보존).
 * excludeExceptions=false면 예외 기간도 생성에 포함(확인 후 선택).
 */
export async function applyPlanAssignment(
  studentId: string,
  templateId: string,
  startDate: string,
  options: { overwrite: boolean; excludeExceptions: boolean },
): Promise<AssignApplyResult> {
  await requireRole("admin");

  if (!isMonday(startDate))
    return { error: "시작일은 항상 월요일이어야 합니다." };

  const ctx = await loadAssignContext(studentId, templateId, startDate);
  if (!ctx) return { error: "학생 또는 템플릿을 찾을 수 없습니다." };
  if (ctx.items.length === 0)
    return { error: "템플릿에 학습 항목이 없습니다." };

  let deleted = 0;
  if (options.overwrite) {
    const { data: deletedRows, error: deleteError } = await ctx.supabase
      .from("tasks")
      .delete()
      .eq("student_id", studentId)
      .eq("status", "planned")
      .gte("date", startDate)
      .lte("date", ctx.periodEnd)
      .select("id");
    if (deleteError)
      return { error: `기존 과제 삭제 실패: ${deleteError.message}` };
    deleted = deletedRows?.length ?? 0;
  }

  const generated = generatePlanTasks({
    studentId,
    startDate,
    durationWeeks: ctx.template.duration_weeks,
    items: ctx.items,
    exceptions: options.excludeExceptions ? ctx.exceptions : [],
  });

  if (generated.length > 0) {
    const { error } = await ctx.supabase.from("tasks").insert(
      generated.map((g) => ({
        student_id: studentId,
        date: g.date,
        subject: g.subject,
        content: g.content,
        status: "planned",
        source_template_id: templateId,
        source_template_task_id: g.source_template_task_id,
      })),
    );
    if (error) return { error: `과제 생성 실패: ${error.message}` };
  }

  revalidatePath("/admin/plan-assign");
  return { error: null, inserted: generated.length, deleted };
}
