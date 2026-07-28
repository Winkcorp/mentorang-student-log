"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { seriesDates } from "@/lib/dates";
import {
  detectConflicts,
  type CandidateSession,
  type Conflict,
} from "@/lib/sessions/conflicts";
import {
  loadConflictContext,
  loadSuppressedDates,
} from "@/lib/sessions/load";
import { createClient } from "@/lib/supabase/server";
import type { EditScope } from "./scope";

/**
 * 세션 시리즈 — CLAUDE.md "세션 생성 규칙" / "충돌 감지 규칙".
 *
 * 흐름: ① 사전 점검(예외일 건너뜀 + 3종 충돌 목록) → ② 사용자 확인 → ③ 생성.
 * 충돌이 있으면 사용자가 명시적으로 확인해야만 저장된다.
 */

export interface SeriesInput {
  assignmentId: string;
  timeSlotId: string;
  roomId: string | null;
  /** ISO 1=월 … 7=일 */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: string;
  totalWeeks: number;
}

export interface PlannedOccurrence {
  weekNumber: number;
  date: string;
}

export interface SeriesCheckResult {
  error?: string;
  /** 실제로 생성될 회차 */
  planned?: PlannedOccurrence[];
  /** 예외일정과 겹쳐 건너뛸 회차 */
  skipped?: PlannedOccurrence[];
  conflicts?: Conflict[];
  /** 화면 표시용 */
  studentName?: string;
  mentorName?: string;
}

export interface SeriesApplyResult {
  error?: string;
  createdCount?: number;
  skippedCount?: number;
  seriesId?: string;
  /** 확인 없이 저장을 시도했을 때 되돌려주는 충돌 목록 */
  conflicts?: Conflict[];
}

interface ResolvedAssignment {
  id: string;
  student_id: string;
  mentor_id: string;
  status: string;
  studentName: string;
  mentorName: string;
}

function validate(input: SeriesInput): string | null {
  if (!input.assignmentId) return "배정을 선택하세요.";
  if (!input.timeSlotId) return "시간대를 선택하세요.";
  if (!input.startDate) return "시작일을 입력하세요.";
  if (input.dayOfWeek < 1 || input.dayOfWeek > 7) return "요일을 선택하세요.";
  if (!input.startTime || !input.endTime) return "시각을 입력하세요.";
  if (input.endTime <= input.startTime) {
    return "종료 시각이 시작 시각보다 늦어야 합니다.";
  }
  if (!Number.isInteger(input.totalWeeks) || input.totalWeeks < 1) {
    return "총 주차는 1 이상의 정수여야 합니다.";
  }
  return null;
}

async function resolveAssignment(
  assignmentId: string,
): Promise<{ error?: string; assignment?: ResolvedAssignment }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("assignments")
    .select("id, student_id, mentor_id, status, students(name), mentors(name)")
    .eq("id", assignmentId)
    .single();

  if (!data) return { error: "배정을 찾을 수 없습니다." };

  // 시리즈는 확정된 배정에만 만든다 (후보 상태로 세션을 깔면 되돌리기가 어렵다)
  if (data.status !== "confirmed") {
    return {
      error:
        "확정(confirmed)된 배정에만 시리즈를 만들 수 있습니다. 배정 화면에서 먼저 확정하세요.",
    };
  }

  const name = (rel: { name: string } | { name: string }[] | null) =>
    (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

  return {
    assignment: {
      id: data.id,
      student_id: data.student_id,
      mentor_id: data.mentor_id,
      status: data.status,
      studentName: name(data.students),
      mentorName: name(data.mentors),
    },
  };
}

/** 저장 전 사전 점검 — 예외일 건너뜀 목록 + 3종 충돌 목록 */
export async function checkSeries(
  input: SeriesInput,
): Promise<SeriesCheckResult> {
  await requireRole("admin");

  const invalid = validate(input);
  if (invalid) return { error: invalid };

  const { error, assignment } = await resolveAssignment(input.assignmentId);
  if (error || !assignment) return { error };

  const all = seriesDates(input.startDate, input.dayOfWeek, input.totalWeeks);
  const suppressed = await loadSuppressedDates(
    assignment.student_id,
    all.map((o) => o.date),
  );

  const planned = all.filter((o) => !suppressed.has(o.date));
  const skipped = all.filter((o) => suppressed.has(o.date));

  const candidates: CandidateSession[] = planned.map((o) => ({
    weekNumber: o.weekNumber,
    mentor_id: assignment.mentor_id,
    student_id: assignment.student_id,
    room_id: input.roomId,
    date: o.date,
    start_time: input.startTime,
    end_time: input.endTime,
  }));

  const ctx = await loadConflictContext(candidates.map((c) => c.date));

  return {
    planned,
    skipped,
    conflicts: detectConflicts(candidates, ctx),
    studentName: assignment.studentName,
    mentorName: assignment.mentorName,
  };
}

/**
 * 시리즈 + 세션 일괄 생성.
 * 충돌이 있으면 acknowledgeConflicts=true 없이는 저장하지 않는다.
 */
export async function createSeries(
  input: SeriesInput,
  opts: { acknowledgeConflicts?: boolean } = {},
): Promise<SeriesApplyResult> {
  await requireRole("admin");

  const check = await checkSeries(input);
  if (check.error) return { error: check.error };

  const planned = check.planned ?? [];
  if (!planned.length) {
    return {
      error:
        "생성할 회차가 없습니다 (모든 날짜가 예외일정과 겹칩니다). 시작일이나 주차를 조정하세요.",
    };
  }

  if (check.conflicts?.length && !opts.acknowledgeConflicts) {
    return { conflicts: check.conflicts, error: "충돌 확인이 필요합니다." };
  }

  const { assignment } = await resolveAssignment(input.assignmentId);
  if (!assignment) return { error: "배정을 찾을 수 없습니다." };

  const supabase = await createClient();

  const { data: series, error: seriesError } = await supabase
    .from("session_series")
    .insert({
      assignment_id: input.assignmentId,
      time_slot_id: input.timeSlotId,
      room_id: input.roomId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      start_date: input.startDate,
      total_weeks: input.totalWeeks,
      status: "active",
    })
    .select("id")
    .single();

  if (seriesError || !series) {
    return { error: seriesError?.message ?? "시리즈 생성에 실패했습니다." };
  }

  const { error: sessionsError } = await supabase.from("sessions").insert(
    planned.map((o) => ({
      student_id: assignment.student_id,
      mentor_id: assignment.mentor_id,
      series_id: series.id,
      room_id: input.roomId,
      time_slot_id: input.timeSlotId,
      date: o.date,
      start_time: input.startTime,
      end_time: input.endTime,
      status: "scheduled",
      week_number: o.weekNumber,
    })),
  );

  if (sessionsError) {
    // 세션 생성이 실패하면 빈 시리즈가 남지 않도록 되돌린다
    await supabase.from("session_series").delete().eq("id", series.id);
    return { error: sessionsError.message };
  }

  revalidatePath("/admin/series");
  revalidatePath("/admin/operations");

  return {
    seriesId: series.id,
    createdCount: planned.length,
    skippedCount: check.skipped?.length ?? 0,
  };
}

// =============================================================
// 시리즈 수정·삭제 — "이 회차만 / 이 회차 이후 전체 / 전체 시리즈"
// =============================================================

/** 확정된 과거 세션 — 어떤 범위 선택에서도 건드리지 않는다 */
const LOCKED_STATUSES = ["completed", "no_show"];

export interface ScopeResult {
  error?: string;
  affected?: number;
  /** 확정 상태라서 제외된 회차 수 */
  locked?: number;
}

async function resolveScopeTargets(
  seriesId: string,
  anchorSessionId: string,
  scope: EditScope,
): Promise<{ error?: string; ids?: string[]; locked?: number }> {
  const supabase = await createClient();

  const { data: anchor } = await supabase
    .from("sessions")
    .select("id, date, series_id")
    .eq("id", anchorSessionId)
    .single();

  if (!anchor || anchor.series_id !== seriesId) {
    return { error: "회차를 찾을 수 없습니다." };
  }

  let query = supabase
    .from("sessions")
    .select("id, status, date")
    .eq("series_id", seriesId)
    .is("deleted_at", null);

  if (scope === "single") query = query.eq("id", anchorSessionId);
  if (scope === "following") query = query.gte("date", anchor.date);

  const { data: rows } = await query;

  const all = rows ?? [];
  const editable = all.filter((s) => !LOCKED_STATUSES.includes(s.status));

  return {
    ids: editable.map((s) => s.id),
    locked: all.length - editable.length,
  };
}

/**
 * 회차 시각·공간 변경.
 *
 * scope='all'일 때만 시리즈 정의(session_series) 자체도 갱신한다.
 * 'single'/'following'은 개별 회차만 바꾸므로 시리즈 정의와 달라질 수 있고,
 * 그게 의도다(중간에 시간대가 바뀐 경우).
 */
export async function updateSeriesSessions(
  seriesId: string,
  anchorSessionId: string,
  scope: EditScope,
  patch: { startTime?: string; endTime?: string; roomId?: string | null },
  opts: { acknowledgeConflicts?: boolean } = {},
): Promise<ScopeResult & { conflicts?: Conflict[] }> {
  await requireRole("admin");

  if (
    patch.startTime &&
    patch.endTime &&
    patch.endTime <= patch.startTime
  ) {
    return { error: "종료 시각이 시작 시각보다 늦어야 합니다." };
  }

  const { error, ids, locked } = await resolveScopeTargets(
    seriesId,
    anchorSessionId,
    scope,
  );
  if (error) return { error };
  if (!ids?.length) {
    return {
      error: locked
        ? "선택한 범위의 회차가 모두 확정 상태(완료/노쇼)라 변경할 수 없습니다."
        : "변경할 회차가 없습니다.",
    };
  }

  const supabase = await createClient();

  const { data: targets } = await supabase
    .from("sessions")
    .select("id, student_id, mentor_id, room_id, date, start_time, end_time")
    .in("id", ids);

  // 변경 후 상태로 충돌 검사 — 자기 자신은 id로 제외된다
  const candidates: CandidateSession[] = (targets ?? []).map((s) => ({
    id: s.id,
    mentor_id: s.mentor_id,
    student_id: s.student_id,
    room_id: patch.roomId !== undefined ? patch.roomId : s.room_id,
    date: s.date,
    start_time: patch.startTime ?? s.start_time,
    end_time: patch.endTime ?? s.end_time,
  }));

  const ctx = await loadConflictContext(candidates.map((c) => c.date));
  const conflicts = detectConflicts(candidates, ctx);

  if (conflicts.length && !opts.acknowledgeConflicts) {
    return { conflicts, error: "충돌 확인이 필요합니다." };
  }

  const update: Record<string, unknown> = {};
  if (patch.startTime) update.start_time = patch.startTime;
  if (patch.endTime) update.end_time = patch.endTime;
  if (patch.roomId !== undefined) update.room_id = patch.roomId;

  if (!Object.keys(update).length) return { error: "변경할 내용이 없습니다." };

  const { error: updateError } = await supabase
    .from("sessions")
    .update(update)
    .in("id", ids);

  if (updateError) return { error: updateError.message };

  if (scope === "all") {
    await supabase.from("session_series").update(update).eq("id", seriesId);
  }

  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath("/admin/operations");

  return { affected: ids.length, locked };
}

/** 소프트 삭제 — 하드 삭제하지 않는다 */
export async function deleteSeriesSessions(
  seriesId: string,
  anchorSessionId: string,
  scope: EditScope,
): Promise<ScopeResult> {
  await requireRole("admin");

  const { error, ids, locked } = await resolveScopeTargets(
    seriesId,
    anchorSessionId,
    scope,
  );
  if (error) return { error };
  if (!ids?.length) {
    return {
      error: locked
        ? "선택한 범위의 회차가 모두 확정 상태(완료/노쇼)라 삭제할 수 없습니다."
        : "삭제할 회차가 없습니다.",
    };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: deleteError } = await supabase
    .from("sessions")
    .update({ deleted_at: now })
    .in("id", ids);

  if (deleteError) return { error: deleteError.message };

  if (scope === "all") {
    // 남은 살아있는 회차가 없으면 시리즈도 종료 처리
    const { count } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("series_id", seriesId)
      .is("deleted_at", null);

    if (!count) {
      await supabase
        .from("session_series")
        .update({ status: "canceled", deleted_at: now })
        .eq("id", seriesId);
    }
  }

  revalidatePath(`/admin/series/${seriesId}`);
  revalidatePath("/admin/operations");

  return { affected: ids.length, locked };
}
