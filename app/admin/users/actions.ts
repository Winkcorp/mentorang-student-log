"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 계정에 역할을 부여한다 (admin 전용).
 *
 * service_role을 쓰지 않는다 — profiles의 RLS admin 정책(update)이
 * anon key + 세션 기반으로 권한을 강제하므로 이 경로가 더 안전하다.
 */
export async function assignRole(formData: FormData) {
  await requireRole("admin");

  const profileId = String(formData.get("profileId") ?? "");
  const role = String(formData.get("role") ?? "");
  const linkId = String(formData.get("linkId") ?? "");

  if (!profileId || !["admin", "mentor", "parent"].includes(role)) {
    return { error: "잘못된 요청입니다." };
  }
  if ((role === "mentor" || role === "parent") && !linkId) {
    return { error: "연결할 멘토/학부모를 선택해주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      role,
      mentor_id: role === "mentor" ? linkId : null,
      parent_id: role === "parent" ? linkId : null,
    })
    .eq("id", profileId);

  if (error) return { error: `역할 부여 실패: ${error.message}` };

  revalidatePath("/admin/users");
  return { error: null };
}

/**
 * 역할 회수 (승인 대기 상태로 되돌림).
 */
export async function revokeRole(formData: FormData) {
  await requireRole("admin");

  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: null, mentor_id: null, parent_id: null })
    .eq("id", profileId);

  if (error) return { error: `역할 회수 실패: ${error.message}` };

  revalidatePath("/admin/users");
  return { error: null };
}
