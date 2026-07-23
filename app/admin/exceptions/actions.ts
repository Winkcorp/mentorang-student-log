"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createException(formData: FormData): Promise<void> {
  await requireRole("admin");

  const studentId = String(formData.get("studentId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!startDate || !endDate || endDate < startDate) return;

  const supabase = await createClient();
  await supabase.from("exceptions").insert({
    student_id: studentId || null, // 비우면 전체(학원 단위) 예외
    start_date: startDate,
    end_date: endDate,
    reason: reason || null,
  });

  revalidatePath("/admin/exceptions");
}

export async function deleteException(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("exceptions").delete().eq("id", id);

  revalidatePath("/admin/exceptions");
}
