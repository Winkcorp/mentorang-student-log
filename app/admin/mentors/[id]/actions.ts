"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 멘토 담당 자격(mentor_capabilities) 관리.
 * 담당 과목을 text[]로 두지 않는다 — 배정 화면의 후보 필터가 이 테이블을 본다.
 */

export async function addCapability(
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole("admin");

  const mentorId = String(formData.get("mentorId") ?? "");
  const sessionTypeId = String(formData.get("sessionTypeId") ?? "");
  const rawSubjectId = String(formData.get("subjectId") ?? "");

  if (!mentorId || !sessionTypeId) {
    return { error: "세션유형을 선택하세요." };
  }

  const supabase = await createClient();

  const { data: sessionType } = await supabase
    .from("session_types")
    .select("id, name, requires_subject")
    .eq("id", sessionTypeId)
    .single();

  if (!sessionType) return { error: "세션유형을 찾을 수 없습니다." };

  // 과목 무관 유형은 과목을 비우고, 과목 필요 유형은 반드시 받는다.
  const subjectId = sessionType.requires_subject ? rawSubjectId || "" : "";

  if (sessionType.requires_subject && !subjectId) {
    return { error: `"${sessionType.name}"은 과목이 필요한 유형입니다.` };
  }

  const { error } = await supabase.from("mentor_capabilities").insert({
    mentor_id: mentorId,
    session_type_id: sessionTypeId,
    subject_id: subjectId || null,
  });

  if (error) {
    // unique nulls not distinct 위반 — 같은 조합이 이미 있음
    if (error.code === "23505") {
      return { error: "이미 등록된 조합입니다." };
    }
    return { error: error.message };
  }

  revalidatePath(`/admin/mentors/${mentorId}`);
  return { error: null };
}

export async function removeCapability(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const mentorId = String(formData.get("mentorId") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("mentor_capabilities").delete().eq("id", id);

  revalidatePath(`/admin/mentors/${mentorId}`);
}
