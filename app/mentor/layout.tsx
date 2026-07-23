import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

const NAV = [
  { href: "/mentor", label: "내 학생" },
  { href: "/mentor/calendar", label: "캘린더" },
  { href: "/mentor/sessions", label: "세션 관리" },
];

export default async function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("mentor");

  return (
    <AppShell title="멘토" nav={NAV} userLabel={profile.email ?? ""}>
      {children}
    </AppShell>
  );
}
