import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";

/**
 * 루트 — proxy가 먼저 처리하지만, 이중 방어로 서버에서도 리다이렉트.
 */
export default async function RootPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.role) redirect("/pending");
  redirect(`/${profile.role}`);
}
