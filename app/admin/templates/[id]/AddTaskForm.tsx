"use client";

import { useState, useTransition } from "react";
import { addTemplateTask } from "../actions";
import {
  ITEM_TYPE_LABEL,
  DAY_OF_WEEK,
  DAY_LABEL,
  type ItemType,
} from "@/lib/plan/config";

const inputCls = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm";
const labelCls = "mb-1 block text-xs font-medium text-gray-500";

export function AddTaskForm({ templateId }: { templateId: string }) {
  const [itemType, setItemType] = useState<ItemType>("daily_routine");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await addTemplateTask(formData);
          setError(result.error);
          if (!result.error) {
            // 성공 시 내용 필드만 비우도록 폼 리셋은 브라우저 기본 동작에 맡김
          }
        });
      }}
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
    >
      <input type="hidden" name="templateId" value={templateId} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>과목 *</label>
          <input name="subject" required placeholder="국어" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>유형 *</label>
          <select
            name="itemType"
            value={itemType}
            onChange={(e) => setItemType(e.target.value as ItemType)}
            className={inputCls}
          >
            {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABEL[t]} ({t})
              </option>
            ))}
          </select>
        </div>
      </div>

      {itemType === "daily_routine" && (
        <div>
          <label className={labelCls}>반복할 내용 *</label>
          <input
            name="instruction"
            required
            placeholder="강기본 하루 2강씩"
            className={`${inputCls} w-full`}
          />
        </div>
      )}

      {itemType === "sequential" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>단위 이름 *</label>
            <input
              name="unitLabel"
              required
              placeholder="Day"
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className={labelCls}>시작 번호 *</label>
            <input
              name="startUnit"
              type="number"
              min="1"
              required
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className={labelCls}>주기당 전진량 *</label>
            <input
              name="unitsPerPeriod"
              type="number"
              min="1"
              required
              defaultValue={3}
              className={`${inputCls} w-24`}
            />
          </div>
          <div>
            <label className={labelCls}>주기(일) *</label>
            <input
              name="periodDays"
              type="number"
              min="1"
              required
              defaultValue={1}
              className={`${inputCls} w-20`}
            />
          </div>
          <div>
            <label className={labelCls}>복습 텀(일) *</label>
            <input
              name="reviewLagDays"
              type="number"
              min="1"
              required
              defaultValue={3}
              className={`${inputCls} w-20`}
            />
          </div>
          <div>
            <label className={labelCls}>전체 범위(선택)</label>
            <input
              name="totalUnits"
              type="number"
              min="1"
              placeholder="60"
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
      )}

      {itemType === "conditional" && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>트리거 (이 행동이 확인되면) *</label>
            <input
              name="trigger"
              required
              placeholder="수1 인강 1강 시청"
              className={`${inputCls} w-full`}
            />
          </div>
          <div>
            <label className={labelCls}>액션 (이 과제가 생성됨) *</label>
            <input
              name="action"
              required
              placeholder="마플 해당 단원 문제 풀이"
              className={`${inputCls} w-full`}
            />
          </div>
        </div>
      )}

      {itemType === "one_time" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>주차 *</label>
            <input
              name="weekNumber"
              type="number"
              min="1"
              required
              className={`${inputCls} w-20`}
            />
          </div>
          <div>
            <label className={labelCls}>요일 *</label>
            <select name="dayOfWeek" required className={inputCls}>
              {DAY_OF_WEEK.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-64 flex-1">
            <label className={labelCls}>내용 *</label>
            <input
              name="content"
              required
              placeholder="모의고사 국어 기출 1회분"
              className={`${inputCls} w-full`}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "저장 중..." : "항목 추가"}
      </button>
    </form>
  );
}
