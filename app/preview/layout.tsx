import Link from "next/link";

/**
 * 미리보기 모드 — Supabase 연결 없이 mock 데이터로 화면 확인용.
 * 실제 페이지와 동일한 컴포넌트/스타일을 쓴다.
 */

const PAGES = [
  { href: "/preview", label: "홈" },
  { href: "/preview/calendar", label: "⭐ 캘린더" },
  { href: "/preview/login", label: "로그인" },
  { href: "/preview/admin", label: "관리자" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/plan-assign", label: "계획 배정" },
  { href: "/preview/settlements", label: "정산" },
  { href: "/preview/mentor", label: "멘토" },
  { href: "/preview/parent", label: "학부모" },
];

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-2">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs font-bold text-amber-800">
            🔍 미리보기 (mock 데이터 — DB 미연결)
          </span>
          <nav className="flex flex-wrap gap-2">
            {PAGES.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="text-xs text-amber-700 underline hover:text-amber-900"
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
