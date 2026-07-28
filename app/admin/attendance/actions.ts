"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 수동 출결 — 그날 세션이 아예 없는 경우에만 허용된다.
 * DB 트리거(reject_override_when_session_exists)가 한 번 더 막으므로,
 * 화면 상태가 낡아서 잘못 눌린 경우에도 저장되지 않는다.
 */

const ALLOWED = ["present", "partial", "absent"];

export async function setManualAttendance(
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole("admin");

  const studentId = String(formData.get("studentId") ?? "");
  const date = String(formData.get("date") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!studentId || !date) return { error: "학생과 날짜가 필요합니다." };
  if (!ALLOWED.includes(status)) return { error: "허용되지 않는 출결값입니다." };

  const supabase = await createClient();

  const { error } = await supabase.from("attendance_overrides").upsert(
    {
      student_id: studentId,
      date,
      status,
      reason: reason || null,
    },
    { onConflict: "student_id,date" },
  );

  if (error) {
    // 트리거가 막은 경우 — 그 사이 세션이 생겼다는 뜻
    if (error.message.includes("수동 입력할 수 없습니다")) {
      return {
        error:
          "그날 세션이 생겼습니다. 출결은 세션 상태로 관리하세요 (화면을 새로고침하세요).",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/attendance");
  return { error: null };
}

export async function clearManualAttendance(
  formData: FormData,
): Promise<void> {
  await requireRole("admin");

  const studentId = String(formData.get("studentId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!studentId || !date) return;

  const supabase = await createClient();
  await supabase
    .from("attendance_overrides")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);

  revalidatePath("/admin/attendance");
}
