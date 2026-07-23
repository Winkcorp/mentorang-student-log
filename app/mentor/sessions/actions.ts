"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 세션 상태/등록 관리 — mentor 본인 세션만 (RLS가 mentor_id를 강제).
 * admin도 사용 가능 (RLS admin 정책).
 */

const SETTABLE_STATUSES = ["completed", "no_show", "canceled"] as const;

export async function createSession(formData: FormData): Promise<void> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent") return;

  const studentId = String(formData.get("studentId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const mentorId =
    profile.role === "admin"
      ? String(formData.get("mentorId") ?? "")
      : profile.mentor_id!;

  if (!studentId || !date || !startTime || !endTime || !mentorId) return;
  if (endTime <= startTime) return;

  const supabase = await createClient();
  // 상태값에 "scheduled"가 없으므로(CLAUDE.md 스키마) 세션은 진행 후
  // "기록"하는 흐름 — 등록 시 completed, 노쇼/취소는 버튼으로 변경.
  await supabase.from("sessions").insert({
    student_id: studentId,
    mentor_id: mentorId,
    date,
    start_time: startTime,
    end_time: endTime,
    status: "completed",
  });

  revalidatePath("/mentor/sessions");
}

export async function updateSessionStatus(formData: FormData): Promise<void> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent") return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !SETTABLE_STATUSES.includes(status as never)) return;

  const supabase = await createClient();
  await supabase.from("sessions").update({ status }).eq("id", id);

  revalidatePath("/mentor/sessions");
}

/**
 * 취소된 세션의 대체수업 등록 — related_session_id로 원 세션과 연결.
 * 정산 시 원 세션과 이중 정산되지 않는다 (calculate.ts에서 원 세션 제외).
 */
export async function createMakeupSession(formData: FormData): Promise<void> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent") return;

  const originalId = String(formData.get("originalId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  if (!originalId || !date || !startTime || !endTime) return;
  if (endTime <= startTime) return;

  const supabase = await createClient();

  const { data: original } = await supabase
    .from("sessions")
    .select("id, student_id, mentor_id, status")
    .eq("id", originalId)
    .single();
  if (!original) return;

  // 이미 이 세션의 대체수업이 있으면 중복 생성 방지
  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("related_session_id", originalId);
  if (count) return;

  await supabase.from("sessions").insert({
    student_id: original.student_id,
    mentor_id: original.mentor_id,
    date,
    start_time: startTime,
    end_time: endTime,
    status: "makeup",
    related_session_id: originalId,
  });

  revalidatePath("/mentor/sessions");
}
