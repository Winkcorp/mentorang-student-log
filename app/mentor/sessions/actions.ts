"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 세션 상태/등록 관리 — mentor 본인 세션만 (RLS가 mentor_id를 강제).
 * admin도 사용 가능 (RLS admin 정책).
 */

const SETTABLE_STATUSES = ["completed", "no_show", "canceled"] as const;

/**
 * 그 회차에 나간 학습 범위 기록.
 * 다음 회차의 progress_from 기본값은 이 progress_to에서 제안된다
 * (lib/sessions/title.ts의 suggestNextProgressFrom).
 */
export async function updateSessionProgress(
  formData: FormData,
): Promise<{ error: string | null }> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent") {
    return { error: "권한이 없습니다." };
  }

  const id = String(formData.get("id") ?? "");
  const fromRaw = String(formData.get("progressFrom") ?? "").trim();
  const toRaw = String(formData.get("progressTo") ?? "").trim();
  if (!id) return { error: "세션을 찾을 수 없습니다." };

  const from = fromRaw ? Number(fromRaw) : null;
  const to = toRaw ? Number(toRaw) : null;

  if (from != null && !Number.isFinite(from)) return { error: "시작 진도가 숫자가 아닙니다." };
  if (to != null && !Number.isFinite(to)) return { error: "종료 진도가 숫자가 아닙니다." };
  if (from != null && to != null && to < from) {
    return { error: "종료 진도가 시작 진도보다 커야 합니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ progress_from: from, progress_to: to })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/mentor/sessions");
  return { error: null };
}

/**
 * 여러 세션의 상태를 한 번에 변경.
 * 화면에서 "N건이 변경됩니다" 확인을 받은 뒤 호출한다.
 */
export async function bulkUpdateSessionStatus(
  ids: string[],
  status: string,
): Promise<{ error: string | null; affected?: number }> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent") {
    return { error: "권한이 없습니다." };
  }

  if (!ids.length) return { error: "선택된 세션이 없습니다." };
  if (!SETTABLE_STATUSES.includes(status as never)) {
    return { error: "허용되지 않는 상태입니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ status })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath("/mentor/sessions");
  return { error: null, affected: data?.length ?? 0 };
}

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
  // 시리즈 밖의 단발 세션은 "진행 후 기록"하는 흐름이므로 completed로 넣는다.
  // (시리즈로 미리 깔아두는 세션은 status=scheduled로 생성된다)
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
