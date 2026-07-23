"use client";

import { useState, useTransition } from "react";
import { toggleTask } from "@/lib/actions/tasks";
import { DAY_LABEL, DAY_OF_WEEK } from "@/lib/plan/config";

export interface TaskRow {
  id: string;
  date: string;
  subject: string;
  content: string;
  status: string;
  related_task_id: string | null;
}

function dayLabel(date: string) {
  const idx = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
  return DAY_LABEL[DAY_OF_WEEK[idx]];
}

/**
 * 날짜별 과제 체크리스트 — admin/mentor 공용.
 * readOnly면 체크박스 비활성 (parent 뷰용).
 */
export function TaskChecklist({
  tasks,
  readOnly = false,
}: {
  tasks: TaskRow[];
  readOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const byDate = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date)!.push(t);
  }
  const dates = [...byDate.keys()].sort();

  function onToggle(task: TaskRow, done: boolean) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await toggleTask(task.id, done);
      if (r.error) setError(r.error);
      else if (r.created)
        setNotice(
          `후속 과제가 생성되었습니다: ${r.created.date} — ${r.created.content}`,
        );
    });
  }

  if (tasks.length === 0)
    return <p className="text-sm text-gray-400">과제가 없습니다.</p>;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      )}

      {dates.map((date) => (
        <section key={date}>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            {date} ({dayLabel(date)})
          </h3>
          <ul className="space-y-1">
            {byDate.get(date)!.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  disabled={readOnly || isPending}
                  onChange={(e) => onToggle(t, e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {t.subject}
                </span>
                <span
                  className={`text-sm ${
                    t.status === "done"
                      ? "text-gray-400 line-through"
                      : "text-gray-900"
                  }`}
                >
                  {t.content}
                </span>
                {t.related_task_id && (
                  <span className="ml-auto rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                    연계
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
