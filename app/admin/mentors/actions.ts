"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createMentor(formData: FormData) {
  await requireRole("admin");

  const name = String(formData.get("name") ?? "").trim();
  const rateType = String(formData.get("rateType") ?? "");
  const rateAmount = Number(formData.get("rateAmount") ?? 0);

  if (!name || !["hourly", "per_session", "flat"].includes(rateType)) return;
  if (!Number.isFinite(rateAmount) || rateAmount < 0) return;

  // 담당 과목은 여기서 받지 않는다 — 멘토 상세 화면에서
  // mentor_capabilities(세션유형 x 과목)로 등록한다
  const supabase = await createClient();
  await supabase.from("mentors").insert({
    name,
    rate_type: rateType,
    rate_amount: rateAmount,
  });

  revalidatePath("/admin/mentors");
}

/** 하드 삭제 금지 — status 토글로만 관리 */
export async function toggleMentorStatus(formData: FormData) {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const current = String(formData.get("current") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("mentors")
    .update({ status: current === "active" ? "inactive" : "active" })
    .eq("id", id);

  revalidatePath("/admin/mentors");
}
