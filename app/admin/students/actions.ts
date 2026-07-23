"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createStudent(formData: FormData) {
  await requireRole("admin");

  const name = String(formData.get("name") ?? "").trim();
  const school = String(formData.get("school") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "");
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("students").insert({
    name,
    school: school || null,
    grade: grade || null,
    parent_id: parentId || null,
  });

  revalidatePath("/admin/students");
}

/** 하드 삭제 금지 — status 토글로만 관리 */
export async function toggleStudentStatus(formData: FormData) {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const current = String(formData.get("current") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("students")
    .update({ status: current === "active" ? "inactive" : "active" })
    .eq("id", id);

  revalidatePath("/admin/students");
}
