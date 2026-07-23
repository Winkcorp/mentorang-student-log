import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ITEM_TYPE_LABEL,
  DAY_LABEL,
  type ItemType,
  type DayOfWeek,
} from "@/lib/plan/config";
import { AddTaskForm } from "./AddTaskForm";
import { BulkPasteForm } from "./BulkPasteForm";
import { deleteTemplateTask } from "../actions";

function describeConfig(itemType: ItemType, config: Record<string, unknown>) {
  switch (itemType) {
    case "daily_routine":
      return `매일: ${config.instruction}`;
    case "sequential":
      return `${config.unit_label} ${config.start_unit}부터 ${config.period_days}일마다 ${config.units_per_period}개씩, 완료 ${config.review_lag_days}일 뒤 복습${config.total_units ? ` (총 ${config.total_units}까지)` : ""}`;
    case "conditional":
      return `"${config.trigger}" 완료 시 → "${config.action}" 생성`;
    case "one_time":
      return `${config.week_number}주차 ${DAY_LABEL[config.day_of_week as DayOfWeek] ?? config.day_of_week}: ${config.content}`;
    default:
      return JSON.stringify(config);
  }
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("study_plan_templates")
    .select("id, name, duration_weeks")
    .eq("id", id)
    .single();

  if (!template) notFound();

  const { data: tasks } = await supabase
    .from("template_tasks")
    .select("id, subject, item_type, config")
    .eq("template_id", id)
    .order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/templates" className="text-sm text-blue-600 hover:underline">
          ← 템플릿 목록
        </Link>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {template.name}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {template.duration_weeks}주
          </span>
        </h1>
      </div>

      <AddTaskForm templateId={template.id} />
      <BulkPasteForm templateId={template.id} />

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          학습 항목 ({tasks?.length ?? 0})
        </h2>
        <ul className="space-y-2">
          {(tasks ?? []).map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
            >
              <div className="text-sm">
                <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {ITEM_TYPE_LABEL[t.item_type as ItemType]}
                </span>
                <span className="font-medium text-gray-900">{t.subject}</span>
                <span className="ml-2 text-gray-600">
                  {describeConfig(t.item_type as ItemType, t.config)}
                </span>
              </div>
              <form action={deleteTemplateTask}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <button
                  type="submit"
                  className="text-xs text-red-500 hover:underline"
                >
                  삭제
                </button>
              </form>
            </li>
          ))}
          {!tasks?.length && (
            <p className="text-sm text-gray-400">
              항목이 없습니다. 위 폼으로 추가하세요.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
