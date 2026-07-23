import { SignOutButton } from "@/components/SignOutButton";
import { NavTabs, type NavItem } from "@/components/NavTabs";

/**
 * 역할별 공통 레이아웃 셸 — 상단 바 + 탭 네비게이션.
 */
export function AppShell({
  title,
  nav,
  userLabel,
  children,
}: {
  title: string;
  nav: NavItem[];
  userLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between px-4 pt-3 pb-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900 text-sm font-black text-white">
              멘
            </span>
            <span className="text-[15px] font-bold tracking-tight text-gray-900">
              멘토랑
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-gray-400 sm:inline">
              {userLabel}
            </span>
            <SignOutButton />
          </div>
        </div>
        <NavTabs nav={nav} />
      </header>
      <main className="mx-auto max-w-[1520px] px-4 py-6">{children}</main>
    </div>
  );
}
