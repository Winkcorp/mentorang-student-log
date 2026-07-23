import { AppShell } from "@/components/AppShell";
import { AssignFlow } from "@/app/admin/plan-assign/AssignFlow";

const NAV = [
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/plan-assign", label: "계획 배정" },
  { href: "/preview/settlements", label: "정산" },
];

export default function PreviewPlanAssignPage() {
  return (
    <AppShell title="관리자" nav={NAV} userLabel="admin@mentorang.kr">
      <div className="space-y-6">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">계획 배정</h1>
          <p className="text-sm text-gray-500">
            학생에게 템플릿을 배정하면 기간에 맞춰 과제가 자동 생성됩니다.
            시작일은 반드시 월요일이어야 합니다.
          </p>
        </div>
        {/* 실제 클라이언트 컴포넌트 — "사전 점검"은 DB 미연결이라 에러 표시됨 */}
        <AssignFlow
          students={[
            { id: "s1", name: "김학생" },
            { id: "s2", name: "이학생" },
          ]}
          templates={[
            { id: "t1", name: "이과_A_4주" },
            { id: "t2", name: "문과_B_2주" },
          ]}
        />

        {/* 사전 점검 결과 예시 (mock) */}
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-600">
            ↓ 사전 점검 후 이렇게 표시됩니다 (예시)
          </p>
          <p className="text-sm text-gray-800">
            2026-08-03 ~ 2026-08-30 (4주) — 과제 <b>87개</b>가 생성됩니다.
          </p>
          <label className="flex items-start gap-2 text-sm text-amber-800">
            <input type="checkbox" className="mt-0.5" />
            <span>
              이 기간에 기존 과제 <b>12개</b>와 겹칩니다. 체크하면 기존
              미완료(planned) 과제를 삭제하고 덮어씁니다. (완료된 과제는 보존)
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-amber-800">
            <input type="checkbox" defaultChecked className="mt-0.5" />
            <span>
              이 기간 중 예외일정 <b>3일</b>이 있습니다 (2026-08-03,
              2026-08-04, 2026-08-05). 체크하면 해당 날짜는 매일 반복·순차
              생성에서 제외합니다. (권장)
            </span>
          </label>
          <button className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white">
            배정 실행
          </button>
        </div>
      </div>
    </AppShell>
  );
}
