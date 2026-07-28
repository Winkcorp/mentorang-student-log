"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  validateConfig,
  type ItemType,
  type DayOfWeek,
} from "@/lib/plan/config";
import { parseOneTimeTable, type ParseError } from "@/lib/plan/parseOneTime";
import { loadSubjectsByName } from "@/lib/subjects/resolve";

export interface ActionResult {
  error: string | null;
}

export async function createTemplate(formData: FormData): Promise<void> {
  await requireRole("admin");

  const name = String(formData.get("name") ?? "").trim();
  const durationWeeks = Number(formData.get("durationWeeks") ?? 0);
  if (!name || !Number.isInteger(durationWeeks) || durationWeeks <= 0) return;

  const supabase = await createClient();
  await supabase
    .from("study_plan_templates")
    .insert({ name, duration_weeks: durationWeeks });

  revalidatePath("/admin/templates");
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // template_tasks는 CASCADE로 함께 삭제, 기존 tasks.source_template_id는 SET NULL
  await supabase.from("study_plan_templates").delete().eq("id", id);

  revalidatePath("/admin/templates");
}

/**
 * 템플릿에 학습 항목 추가 — item_type별 폼 필드에서 config를 조립하고 검증.
 */
export async function addTemplateTask(
  formData: FormData,
): Promise<ActionResult> {
  await requireRole("admin");

  const templateId = String(formData.get("templateId") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "");
  const itemType = String(formData.get("itemType") ?? "") as ItemType;

  if (!templateId || !subjectId) return { error: "과목을 선택하세요." };

  let config: Record<string, unknown>;
  switch (itemType) {
    case "daily_routine":
      config = {
        instruction: String(formData.get("instruction") ?? "").trim(),
        days: "mon-sun",
      };
      break;
    case "sequential": {
      config = {
        unit_label: String(formData.get("unitLabel") ?? "").trim(),
        start_unit: Number(formData.get("startUnit")),
        units_per_period: Number(formData.get("unitsPerPeriod")),
        period_days: Number(formData.get("periodDays")),
        review_lag_days: Number(formData.get("reviewLagDays")),
      };
      const totalUnits = String(formData.get("totalUnits") ?? "").trim();
      if (totalUnits) config.total_units = Number(totalUnits);
      break;
    }
    case "conditional":
      config = {
        trigger: String(formData.get("trigger") ?? "").trim(),
        action: String(formData.get("action") ?? "").trim(),
      };
      break;
    case "one_time":
      config = {
        week_number: Number(formData.get("weekNumber")),
        day_of_week: String(formData.get("dayOfWeek") ?? "") as DayOfWeek,
        content: String(formData.get("content") ?? "").trim(),
      };
      break;
    default:
      return { error: "학습 항목 유형을 선택하세요." };
  }

  const validation = validateConfig(itemType, config);
  if (!validation.ok) return { error: validation.errors.join(" ") };

  const supabase = await createClient();

  // one_time 주차가 템플릿 기간을 넘는지 확인
  if (itemType === "one_time") {
    const { data: template } = await supabase
      .from("study_plan_templates")
      .select("duration_weeks")
      .eq("id", templateId)
      .single();
    if (
      template &&
      Number(config.week_number) > Number(template.duration_weeks)
    ) {
      return {
        error: `주차(${config.week_number})가 템플릿 기간(${template.duration_weeks}주)을 초과합니다.`,
      };
    }
  }

  const { error } = await supabase.from("template_tasks").insert({
    template_id: templateId,
    subject_id: subjectId,
    item_type: itemType,
    config,
  });

  if (error) return { error: `저장 실패: ${error.message}` };

  revalidatePath(`/admin/templates/${templateId}`);
  return { error: null };
}

export async function deleteTemplateTask(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("template_tasks").delete().eq("id", id);

  revalidatePath(`/admin/templates/${templateId}`);
}

export interface BulkResult {
  inserted: number;
  errors: ParseError[];
  fatal: string | null;
}

/**
 * GPT 학습플랜 표 붙여넣기 → one_time 항목 일괄 등록.
 * 실패한 행은 조용히 무시하지 않고 행 번호와 이유를 반환한다.
 */
export async function bulkAddOneTime(
  templateId: string,
  text: string,
): Promise<BulkResult> {
  await requireRole("admin");

  if (!templateId || !text.trim())
    return { inserted: 0, errors: [], fatal: "붙여넣은 내용이 없습니다." };

  const { rows, errors } = parseOneTimeTable(text);

  const supabase = await createClient();
  const { data: template } = await supabase
    .from("study_plan_templates")
    .select("duration_weeks")
    .eq("id", templateId)
    .single();

  if (!template)
    return { inserted: 0, errors, fatal: "템플릿을 찾을 수 없습니다." };

  // 과목 이름 → id. 마스터에 없는 과목은 만들지 않고 행 에러로 돌려준다
  const subjects = await loadSubjectsByName();

  const inRange: { row: (typeof rows)[number]; subjectId: string }[] = [];
  for (const r of rows) {
    if (r.week_number > template.duration_weeks) {
      errors.push({
        line: r.line,
        raw: `${r.week_number}주 ${r.day_of_week} ${r.content}`,
        reason: `주차(${r.week_number})가 템플릿 기간(${template.duration_weeks}주)을 초과합니다.`,
      });
      continue;
    }

    const subject = subjects.get(r.subject.trim());
    if (!subject) {
      errors.push({
        line: r.line,
        raw: `${r.week_number}주 ${r.day_of_week} ${r.subject} ${r.content}`,
        reason: `등록되지 않은 과목입니다: "${r.subject}" — 마스터 관리에서 먼저 추가하세요.`,
      });
      continue;
    }

    inRange.push({ row: r, subjectId: subject.id });
  }

  if (inRange.length > 0) {
    const { error } = await supabase.from("template_tasks").insert(
      inRange.map(({ row: r, subjectId }) => ({
        template_id: templateId,
        subject_id: subjectId,
        item_type: "one_time",
        config: {
          week_number: r.week_number,
          day_of_week: r.day_of_week,
          content: r.content,
        },
      })),
    );
    if (error)
      return { inserted: 0, errors, fatal: `저장 실패: ${error.message}` };
  }

  revalidatePath(`/admin/templates/${templateId}`);
  return {
    inserted: inRange.length,
    errors: errors.sort((a, b) => a.line - b.line),
    fatal: null,
  };
}
