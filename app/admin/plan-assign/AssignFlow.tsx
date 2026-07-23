"use client";

import { useState, useTransition } from "react";
import {
  applyPlanAssignment,
  checkPlanAssignment,
  type AssignApplyResult,
  type AssignCheckResult,
} from "./actions";

interface Option {
  id: string;
  name: string;
}

/**
 * 배정 2단계 플로우: ① 사전 점검(월요일/겹침/예외) → ② 확인 후 실행.
 */
export function AssignFlow({
  students,
  templates,
}: {
  students: Option[];
  templates: Option[];
}) {
  const [studentId, setStudentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [check, setCheck] = useState<AssignCheckResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [excludeExceptions, setExcludeExceptions] = useState(true);
  const [result, setResult] = useState<AssignApplyResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const ready = studentId && templateId && startDate;

  function runCheck() {
    setResult(null);
    startTransition(async () => {
      const r = await checkPlanAssignment(studentId, templateId, startDate);
      setCheck(r);
      setOverwrite(false);
      setExcludeExceptions(true);
    });
  }

  function runApply() {
    startTransition(async () => {
      const r = await applyPlanAssignment(studentId, templateId, startDate, {
        overwrite,
        excludeExceptions,
      });
      setResult(r);
      if (!r.error) setCheck(null);
    });
  }

  const selectCls = "rounded-lg border border-gray-300 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학생 *
          </label>
          <select
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setCheck(null);
            }}
            className={selectCls}
          >
            <option value="">선택</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            템플릿 *
          </label>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setCheck(null);
            }}
            className={selectCls}
          >
            <option value="">선택</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            시작일 (월요일) *
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCheck(null);
            }}
            className={selectCls}
          />
        </div>
        <button
          type="button"
          disabled={!ready || isPending}
          onClick={runCheck}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "확인 중..." : "사전 점검"}
        </button>
      </div>

      {check?.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {check.error}
        </div>
      )}

      {check && !check.error && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-gray-800">
            {startDate} ~ {check.periodEnd} ({check.durationWeeks}주) — 과제{" "}
            <b>{check.previewCount}개</b>가 생성됩니다.
          </p>

          {check.overlapCount! > 0 && (
            <label className="flex items-start gap-2 text-sm text-amber-800">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                이 기간에 기존 과제 <b>{check.overlapCount}개</b>와
                겹칩니다. 체크하면 기존 미완료(planned) 과제를 삭제하고
                덮어씁니다. (완료된 과제는 보존)
              </span>
            </label>
          )}

          {check.exceptionDates!.length > 0 && (
            <label className="flex items-start gap-2 text-sm text-amber-800">
              <input
                type="checkbox"
                checked={excludeExceptions}
                onChange={(e) => setExcludeExceptions(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                이 기간 중 예외일정 <b>{check.exceptionDates!.length}일</b>이
                있습니다 ({check.exceptionDates!.join(", ")}). 체크하면 해당
                날짜는 매일 반복·순차 생성에서 제외합니다. (권장)
              </span>
            </label>
          )}

          <button
            type="button"
            disabled={
              isPending || (check.overlapCount! > 0 && !overwrite)
            }
            onClick={runApply}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isPending
              ? "배정 중..."
              : check.overlapCount! > 0 && !overwrite
                ? "겹침 확인 필요"
                : "배정 실행"}
          </button>
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            result.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {result.error ??
            `배정 완료 — 과제 ${result.inserted}개 생성${
              result.deleted ? `, 기존 ${result.deleted}개 삭제` : ""
            }`}
        </div>
      )}
    </div>
  );
}
