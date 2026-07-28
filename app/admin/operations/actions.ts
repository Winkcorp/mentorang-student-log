"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { plusDays } from "@/lib/dates";
import { detectConflicts, type Conflict } from "@/lib/sessions/conflicts";
import { loadConflictContext } from "@/lib/sessions/load";
import { createClient } from "@/lib/supabase/server";

/**
 * 운영 화면(표 뷰 / 리소스 뷰)의 편집 액션.
 *
 * 시간·공간·멘토·날짜가 바뀌는 모든 경로는 저장 전에 같은 충돌 로직을 태운다
 * (표의 인라인 편집, 벌크 편집, 리소스 뷰 드래그 모두 동일).
 * 삭제는 하드 삭제하지 않고 deleted_at — 실행취소가 가능해야 하므로.
 */

const EDITABLE_STATUSES = [
  "scheduled",
  "completed",
  "no_show",
  "canceled",
  "makeup",
];

export interface SessionPatch {
  date?: string;
  startTime?: string;
  endTime?: string;
  mentorId?: string;
  /** null이면 공간 미지정으로 변경 */
  roomId?: string | null;
  status?: string;
  timeSlotId?: string | null;
}

export interface EditResult {
  error?: string;
  affected?: number;
  /** 충돌 때문에 저장하지 않았을 때 — 호출자가 되돌리고 이유를 보여준다 */
  conflicts?: Conflict[];
}

interface SessionRow {
  id: string;
  student_id: string;
  mentor_id: string;
  room_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

/** patch를 적용한 뒤의 모습으로 충돌을 검사한다. */
async function checkPatchConflicts(
  rows: SessionRow[],
  patch: SessionPatch,
  dayShift = 0,
): Promise<Conflict[]> {
  const candidates = rows.map((s) => ({
    id: s.id,
    mentor_id: patch.mentorId ?? s.mentor_id,
    student_id: s.student_id,
    room_id: patch.roomId !== undefined ? patch.roomId : s.room_id,
    date: dayShift ? plusDays(s.date, dayShift) : (patch.date ?? s.date),
    start_time: patch.startTime ?? s.start_time,
    end_time: patch.endTime ?? s.end_time,
  }));

  const ctx = await loadConflictContext(candidates.map((c) => c.date));
  return detectConflicts(candidates, ctx);
}

function buildUpdate(patch: SessionPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (patch.date) update.date = patch.date;
  if (patch.startTime) update.start_time = patch.startTime;
  if (patch.endTime) update.end_time = patch.endTime;
  if (patch.mentorId) update.mentor_id = patch.mentorId;
  if (patch.roomId !== undefined) update.room_id = patch.roomId;
  if (patch.timeSlotId !== undefined) update.time_slot_id = patch.timeSlotId;
  if (patch.status) update.status = patch.status;
  return update;
}

/**
 * 단일 세션 수정 — 표의 인라인 편집과 리소스 뷰 드래그가 같이 쓴다.
 *
 * 시간·공간·멘토·날짜가 바뀌면 충돌 검사를 돌리고, 충돌이면 저장하지 않고
 * conflicts를 돌려준다 (드래그는 이걸 받아 원위치로 되돌린다).
 */
export async function moveSession(
  id: string,
  patch: SessionPatch,
  opts: { acknowledgeConflicts?: boolean } = {},
): Promise<EditResult> {
  await requireRole("admin");

  if (!id) return { error: "세션을 찾을 수 없습니다." };
  if (patch.status && !EDITABLE_STATUSES.includes(patch.status)) {
    return { error: "허용되지 않는 상태입니다." };
  }

  const update = buildUpdate(patch);
  if (!Object.keys(update).length) return { error: "변경할 내용이 없습니다." };

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("sessions")
    .select(
      "id, student_id, mentor_id, room_id, date, start_time, end_time, status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!row) return { error: "세션을 찾을 수 없습니다." };

  const start = patch.startTime ?? row.start_time;
  const end = patch.endTime ?? row.end_time;
  if (end <= start) {
    return { error: "종료 시각이 시작 시각보다 늦어야 합니다." };
  }

  // 시간·공간·멘토·날짜가 바뀔 때만 충돌 검사 (상태만 바꾸는 건 검사 불필요)
  const affectsPlacement =
    patch.date !== undefined ||
    patch.startTime !== undefined ||
    patch.endTime !== undefined ||
    patch.mentorId !== undefined ||
    patch.roomId !== undefined;

  if (affectsPlacement) {
    const conflicts = await checkPatchConflicts([row as SessionRow], patch);
    if (conflicts.length && !opts.acknowledgeConflicts) {
      return { conflicts, error: "충돌이 있어 이동하지 않았습니다." };
    }
  }

  const { error } = await supabase.from("sessions").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/operations");
  return { affected: 1 };
}

/**
 * 벌크 편집 — 상태 변경 / 멘토 변경 / 날짜 이동.
 * 화면에서 "N건이 변경됩니다" 확인을 받은 뒤 호출한다.
 */
export async function bulkEditSessions(
  ids: string[],
  patch: SessionPatch & { shiftDays?: number },
  opts: { acknowledgeConflicts?: boolean } = {},
): Promise<EditResult> {
  await requireRole("admin");

  if (!ids.length) return { error: "선택된 세션이 없습니다." };
  if (patch.status && !EDITABLE_STATUSES.includes(patch.status)) {
    return { error: "허용되지 않는 상태입니다." };
  }

  const shiftDays = patch.shiftDays ?? 0;
  const update = buildUpdate(patch);

  if (!Object.keys(update).length && !shiftDays) {
    return { error: "변경할 내용이 없습니다." };
  }

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("sessions")
    .select(
      "id, student_id, mentor_id, room_id, date, start_time, end_time, status",
    )
    .in("id", ids)
    .is("deleted_at", null);

  if (!rows?.length) return { error: "대상 세션이 없습니다." };

  const affectsPlacement =
    !!shiftDays ||
    patch.date !== undefined ||
    patch.mentorId !== undefined ||
    patch.roomId !== undefined ||
    patch.startTime !== undefined ||
    patch.endTime !== undefined;

  if (affectsPlacement) {
    const conflicts = await checkPatchConflicts(
      rows as SessionRow[],
      patch,
      shiftDays,
    );
    if (conflicts.length && !opts.acknowledgeConflicts) {
      return { conflicts, error: "충돌 확인이 필요합니다." };
    }
  }

  // 날짜 이동은 행마다 값이 달라 한 번의 UPDATE로 못 묶는다
  if (shiftDays) {
    for (const row of rows) {
      const { error } = await supabase
        .from("sessions")
        .update({ ...update, date: plusDays(row.date, shiftDays) })
        .eq("id", row.id);
      if (error) return { error: error.message };
    }
  } else {
    const { error } = await supabase
      .from("sessions")
      .update(update)
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/operations");
  return { affected: rows.length };
}

/** 소프트 삭제 — 5초 실행취소를 위해 deleted_at만 찍는다 */
export async function softDeleteSessions(
  ids: string[],
): Promise<{ error?: string; affected?: number }> {
  await requireRole("admin");
  if (!ids.length) return { error: "선택된 세션이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath("/admin/operations");
  return { affected: data?.length ?? 0 };
}

/** 실행취소 — deleted_at을 지운다 */
export async function undoDeleteSessions(
  ids: string[],
): Promise<{ error?: string; affected?: number }> {
  await requireRole("admin");
  if (!ids.length) return { error: "복구할 세션이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ deleted_at: null })
    .in("id", ids)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath("/admin/operations");
  return { affected: data?.length ?? 0 };
}
