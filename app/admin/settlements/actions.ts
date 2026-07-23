"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dates";
import {
  calculateSettlement,
  type RateType,
  type SettlementSession,
} from "@/lib/settlement/calculate";

export interface RunResult {
  error: string | null;
  processed?: number;
  skipped?: string[];
}

type Supabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

/**
 * 멘토 1명의 기간 정산 계산·저장.
 *
 * 멱등성: settlements(mentor_id, period_start, period_end) UNIQUE.
 * 재실행 시 기존 레코드가 pending이면 계산 필드만 업데이트
 * (adjustment_amount/reason은 보존), confirmed/paid면 건드리지 않는다.
 */
async function runForMentor(
  supabase: Supabase,
  mentor: { id: string; name: string; rate_type: RateType; rate_amount: number },
  periodStart: string,
  periodEnd: string,
): Promise<{ ok: boolean; skippedReason?: string }> {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, date, start_time, end_time, status, related_session_id")
    .eq("mentor_id", mentor.id)
    .gte("date", periodStart)
    .lte("date", periodEnd);

  const result = calculateSettlement({
    rateType: mentor.rate_type,
    rateAmount: Number(mentor.rate_amount),
    sessions: (sessions ?? []) as SettlementSession[],
  });

  const { data: existing } = await supabase
    .from("settlements")
    .select("id, status")
    .eq("mentor_id", mentor.id)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "pending") {
      return {
        ok: false,
        skippedReason: `${mentor.name}: ${existing.status} 상태라 재계산하지 않음`,
      };
    }
    const { error } = await supabase
      .from("settlements")
      .update({
        total_hours: result.totalHours,
        total_sessions: result.totalSessions,
        amount: result.amount,
      })
      .eq("id", existing.id);
    return error
      ? { ok: false, skippedReason: `${mentor.name}: ${error.message}` }
      : { ok: true };
  }

  const { error } = await supabase.from("settlements").insert({
    mentor_id: mentor.id,
    period_start: periodStart,
    period_end: periodEnd,
    total_hours: result.totalHours,
    total_sessions: result.totalSessions,
    amount: result.amount,
    status: "pending",
  });
  return error
    ? { ok: false, skippedReason: `${mentor.name}: ${error.message}` }
    : { ok: true };
}

/** 월별 정산 배치 — 활성 멘토 전원 */
export async function runMonthlySettlements(ym: string): Promise<RunResult> {
  await requireRole("admin");
  if (!/^\d{4}-\d{2}$/.test(ym)) return { error: "잘못된 월 형식입니다." };

  const { start, end } = monthRange(ym);
  const supabase = await createClient();

  const { data: mentors } = await supabase
    .from("mentors")
    .select("id, name, rate_type, rate_amount")
    .eq("status", "active");

  if (!mentors?.length)
    return { error: "활성 멘토가 없습니다." };

  let processed = 0;
  const skipped: string[] = [];
  for (const mentor of mentors) {
    const r = await runForMentor(
      supabase,
      mentor as never,
      start,
      end,
    );
    if (r.ok) processed++;
    else if (r.skippedReason) skipped.push(r.skippedReason);
  }

  revalidatePath("/admin/settlements");
  return { error: null, processed, skipped };
}

export async function confirmSettlement(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("settlements")
    .update({ status: "confirmed" })
    .eq("id", id)
    .eq("status", "pending"); // pending에서만 전환

  revalidatePath("/admin/settlements");
}

export async function markSettlementPaid(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("settlements")
    .update({ status: "paid" })
    .eq("id", id)
    .eq("status", "confirmed"); // confirmed에서만 전환

  revalidatePath("/admin/settlements");
}

/** 확정 전 되돌리기 (confirmed → pending) */
export async function reopenSettlement(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("settlements")
    .update({ status: "pending" })
    .eq("id", id)
    .eq("status", "confirmed");

  revalidatePath("/admin/settlements");
}

/** 수동 조정 — 최종 지급액 = amount + adjustment_amount */
export async function adjustSettlement(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const amountRaw = String(formData.get("adjustmentAmount") ?? "").trim();
  const reason = String(formData.get("adjustmentReason") ?? "").trim();
  if (!id) return;

  const amount = amountRaw === "" ? null : Number(amountRaw);
  if (amount !== null && !Number.isFinite(amount)) return;
  if (amount !== null && !reason) return; // 조정에는 사유 필수

  const supabase = await createClient();
  await supabase
    .from("settlements")
    .update({
      adjustment_amount: amount,
      adjustment_reason: amount === null ? null : reason,
    })
    .eq("id", id)
    .neq("status", "paid"); // 지급 완료 후에는 조정 불가

  revalidatePath("/admin/settlements");
}
