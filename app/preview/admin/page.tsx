import { AppShell } from "@/components/AppShell";

const NAV = [
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/admin", label: "학생" },
  { href: "/preview/admin", label: "멘토" },
  { href: "/preview/admin", label: "학부모" },
  { href: "/preview/admin", label: "배정" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/plan-assign", label: "계획 배정" },
  { href: "/preview/admin", label: "예외일정" },
  { href: "/preview/settlements", label: "정산" },
  { href: "/preview/admin", label: "계정 승인" },
];

const CARDS = [
  { label: "활성 학생", value: 14 },
  { label: "활성 멘토", value: 5 },
  { label: "승인 대기 계정", value: 2 },
];

const STUDENTS = [
  { name: "김학생", school: "한국고", grade: "고2", parent: "김학부모", active: true },
  { name: "이학생", school: "서울고", grade: "고3", parent: "이학부모", active: true },
  { name: "박학생", school: "대한고", grade: "고1", parent: "박학부모", active: false },
];

const PENDING = [
  { email: "new-mentor@example.com" },
  { email: "parent-kim@example.com" },
];

export default function PreviewAdminPage() {
  return (
    <AppShell title="관리자" nav={NAV} userLabel="admin@mentorang.kr">
      <div className="space-y-8">
        <section>
          <h1 className="mb-4 text-xl font-bold text-gray-900">대시보드</h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CARDS.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            학생 관리
          </h2>
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                이름 *
              </label>
              <input className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                학교
              </label>
              <input className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                학년
              </label>
              <input
                placeholder="고2"
                className="w-20 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                학부모
              </label>
              <select className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                <option>선택 안 함</option>
                <option>김학부모</option>
              </select>
            </div>
            <button className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
              등록
            </button>
          </div>
          <ul className="space-y-2">
            {STUDENTS.map((s) => (
              <li
                key={s.name}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 ${
                  s.active ? "bg-white" : "bg-gray-100 opacity-60"
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {s.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {s.school} {s.grade}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    학부모: {s.parent}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-blue-600 underline">
                    과제 보기
                  </span>
                  <span className="text-xs text-gray-500 underline">
                    {s.active ? "비활성화" : "활성화"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            계정 승인 — 승인 대기 ({PENDING.length})
          </h2>
          <ul className="space-y-3">
            {PENDING.map((p) => (
              <li
                key={p.email}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <span className="text-sm font-medium text-gray-900">
                  {p.email}
                </span>
                <div className="flex items-center gap-2">
                  <select className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                    <option>역할 선택</option>
                    <option>admin</option>
                    <option>mentor</option>
                    <option>parent</option>
                  </select>
                  <select className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                    <option>멘토 연결</option>
                    <option>박멘토</option>
                  </select>
                  <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
                    부여
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
