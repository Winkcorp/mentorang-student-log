import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "mentor" | "parent";

export interface Profile {
  id: string;
  email: string | null;
  role: Role | null;
  mentor_id: string | null;
  parent_id: string | null;
}

/**
 * 현재 로그인 사용자의 프로필을 가져온다. 비로그인이면 null.
 * anon key + 세션 쿠키 기반 — RLS로 본인 row만 조회된다.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, role, mentor_id, parent_id")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

/**
 * 서버 컴포넌트(layout/page)에서 역할을 강제한다 — proxy와 별개의 이중 방어.
 * admin은 모든 영역에 접근 가능.
 */
export async function requireRole(role: Role): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.role) redirect("/pending");
  if (profile.role !== role && profile.role !== "admin") {
    redirect(`/${profile.role}`);
  }
  return profile;
}
