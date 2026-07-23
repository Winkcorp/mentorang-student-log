"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createAssignment(formData: FormData) {
  await requireRole("admin");

  const studentId = String(formData.get("studentId") ?? "");
  const mentorId = String(formData.get("mentorId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");

  if (!studentId || !mentorId || !subject || !startDate) return;

  const supabase = await createClient();
  await supabase.from("assignments").insert({
    student_id: studentId,
    mentor_id: mentorId,
    subject,
    start_date: startDate,
  });

  revalidatePath("/admin/assignments");
}

/** 담당 종료 — 삭제 대신 end_date 기록 */
export async function endAssignment(formData: FormData) {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  await supabase.from("assignments").update({ end_date: today }).eq("id", id);

  revalidatePath("/admin/assignments");
}
