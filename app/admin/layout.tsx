import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/operations", label: "운영" },
  { href: "/admin/calendar", label: "캘린더" },
  { href: "/admin/students", label: "학생" },
  { href: "/admin/mentors", label: "멘토" },
  { href: "/admin/parents", label: "학부모" },
  { href: "/admin/assignments", label: "배정" },
  { href: "/admin/series", label: "세션 시리즈" },
  { href: "/admin/attendance", label: "출결" },
  { href: "/admin/templates", label: "템플릿" },
  { href: "/admin/plan-assign", label: "계획 배정" },
  { href: "/admin/exceptions", label: "예외일정" },
  { href: "/admin/settlements", label: "정산" },
  { href: "/admin/masters", label: "마스터" },
  { href: "/admin/users", label: "계정 승인" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("admin");

  return (
    <AppShell title="관리자" nav={NAV} userLabel={profile.email ?? ""}>
      {children}
    </AppShell>
  );
}
