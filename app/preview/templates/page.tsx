import { AppShell } from "@/components/AppShell";
import { AddTaskForm } from "@/app/admin/templates/[id]/AddTaskForm";
import { BulkPasteForm } from "@/app/admin/templates/[id]/BulkPasteForm";
import { ITEM_TYPE_LABEL } from "@/lib/plan/config";
import type { Subject } from "@/lib/masters/types";

/** 미리보기용 과목 마스터 (DB 조회 없이 폼 모양만 보여준다) */
const PREVIEW_SUBJECTS: Subject[] = [
  { id: "s1", name: "국어", display_order: 1, color: "#ef4444" },
  { id: "s2", name: "영어", display_order: 2, color: "#3b82f6" },
  { id: "s3", name: "수학", display_order: 3, color: "#22c55e" },
  { id: "s4", name: "탐구", display_order: 4, color: "#a855f7" },
];

const NAV = [
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/plan-assign", label: "계획 배정" },
  { href: "/preview/settlements", label: "정산" },
];

const ITEMS = [
  {
    type: "daily_routine" as const,
    subject: "국어",
    desc: "매일: 강기본 하루 2강씩",
  },
  {
    type: "sequential" as const,
    subject: "영어",
    desc: "Day 25부터 1일마다 3개씩, 완료 3일 뒤 복습 (총 60까지)",
  },
  {
    type: "conditional" as const,
    subject: "수학",
    desc: '"수1 인강 1강 시청" 완료 시 → "마플 해당 단원 문제 풀이" 생성',
  },
  {
    type: "one_time" as const,
    subject: "국어",
    desc: "1주차 토: 모의고사 국어 기출 1회분",
  },
];

export default function PreviewTemplatePage() {
  return (
    <AppShell title="관리자" nav={NAV} userLabel="admin@mentorang.kr">
      <div className="space-y-6">
        <div>
          <span className="text-sm text-blue-600 underline">← 템플릿 목록</span>
          <h1 className="mt-1 text-xl font-bold text-gray-900">
            이과_A_4주
            <span className="ml-2 text-sm font-normal text-gray-500">4주</span>
          </h1>
        </div>

        {/* 실제 클라이언트 폼 컴포넌트 그대로 — 유형 선택 시 입력 필드가 바뀜 */}
        <AddTaskForm templateId="preview" subjects={PREVIEW_SUBJECTS} />
        <BulkPasteForm
          templateId="preview"
          subjectNames={PREVIEW_SUBJECTS.map((s) => s.name)}
        />

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            학습 항목 (4)
          </h2>
          <ul className="space-y-2">
            {ITEMS.map((t, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
              >
                <div className="text-sm">
                  <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {ITEM_TYPE_LABEL[t.type]}
                  </span>
                  <span className="font-medium text-gray-900">{t.subject}</span>
                  <span className="ml-2 text-gray-600">{t.desc}</span>
                </div>
                <span className="text-xs text-red-500 underline">삭제</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
