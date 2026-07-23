"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

/** 현재 경로 하이라이트가 들어간 상단 탭 네비게이션 */
export function NavTabs({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mx-auto max-w-[1520px] overflow-x-auto px-4">
      <ul className="flex gap-1 py-1.5">
        {nav.map((item, i) => {
          const active =
            pathname === item.href ||
            (item.href.split("/").length > 2 &&
              pathname.startsWith(`${item.href}/`));
          return (
            <li key={`${item.href}-${i}`}>
              <Link
                href={item.href}
                className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
