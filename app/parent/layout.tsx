import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

const NAV = [{ href: "/parent", label: "이번 주 학습" }];

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("parent");

  return (
    <AppShell title="학부모" nav={NAV} userLabel={profile.email ?? ""}>
      {children}
    </AppShell>
  );
}
