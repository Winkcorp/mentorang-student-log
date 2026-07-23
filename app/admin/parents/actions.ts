"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createParent(formData: FormData) {
  await requireRole("admin");

  const name = String(formData.get("name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("parents").insert({ name, contact: contact || null });

  revalidatePath("/admin/parents");
}
