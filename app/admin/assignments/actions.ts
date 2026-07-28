"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { loadMentorLoads } from "@/lib/mentors/load";
import { createClient } from "@/lib/supabase/server";

/**
 * 배정 후보 워크플로 — CLAUDE.md "배정 후보 워크플로".
 *
 * 캘린더 메모로 관리하던 "국어PT 후보" 명단을 assignments row로 옮긴 것.
 * candidate 복수 등록 → 한 명을 confirmed로 전환 → 나머지는 자동 ended.
 */

export interface CandidateMentor {
  id: string;
  name: string;
  /** 확정 배정 기준 담당 학생 수 */
  studentCount: number;
  /** "월2 화3" — 요일별 예정 세션 수 */
  dowSummary: string;
  sessionsByDow: number[];
  /** 이 조합에 이미 등록된 배정이 있으면 그 상태 */
  existingStatus: string | null;
}

export interface CandidateListResult {
  error?: string;
  /** 자격을 갖춘 멘토만 */
  mentors?: CandidateMentor[];
}

/**
 * 학생 + 세션유형(+과목) 조합에 자격이 있는 멘토 목록.
 *
 * 자격 판정: mentor_capabilities에 (session_type_id, subject_id)가 그대로 있어야
 * 한다. 과목 무관 유형은 subject_id가 null인 자격과 맞춘다.
 */
export async function loadCandidateMentors(
  studentId: string,
  sessionTypeId: string,
  subjectId: string | null,
): Promise<CandidateListResult> {
  await requireRole("admin");

  if (!studentId || !sessionTypeId) {
    return { error: "학생과 세션유형을 선택하세요." };
  }

  const supabase = await createClient();

  const { data: sessionType } = await supabase
    .from("session_types")
    .select("id, name, requires_subject")
    .eq("id", sessionTypeId)
    .single();

  if (!sessionType) return { error: "세션유형을 찾을 수 없습니다." };

  if (sessionType.requires_subject && !subjectId) {
    return { error: `"${sessionType.name}"은 과목을 선택해야 합니다.` };
  }

  // 과목 무관 유형이면 과목 조건을 null로 강제 (선택값이 남아있어도 무시)
  const effectiveSubjectId = sessionType.requires_subject ? subjectId : null;

  let capQuery = supabase
    .from("mentor_capabilities")
    .select("mentor_id")
    .eq("session_type_id", sessionTypeId);

  capQuery = effectiveSubjectId
    ? capQuery.eq("subject_id", effectiveSubjectId)
    : capQuery.is("subject_id", null);

  const { data: caps } = await capQuery;

  const mentorIds = [...new Set((caps ?? []).map((c) => c.mentor_id))];
  if (!mentorIds.length) return { mentors: [] };

  const [{ data: mentors }, loads, { data: existing }] = await Promise.all([
    supabase
      .from("mentors")
      .select("id, name")
      .in("id", mentorIds)
      .eq("status", "active")
      .order("name"),
    loadMentorLoads(mentorIds),
    // 이 조합에 이미 등록된 배정 (중복 등록 방지 + 화면 표시)
    supabase
      .from("assignments")
      .select("mentor_id, status")
      .eq("student_id", studentId)
      .eq("session_type_id", sessionTypeId)
      .neq("status", "ended"),
  ]);

  const existingByMentor = new Map<string, string>();
  for (const a of existing ?? []) existingByMentor.set(a.mentor_id, a.status);

  return {
    mentors: (mentors ?? []).map((m) => {
      const load = loads.get(m.id);
      return {
        id: m.id,
        name: m.name,
        studentCount: load?.studentCount ?? 0,
        dowSummary: load?.dowSummary ?? "",
        sessionsByDow: load?.sessionsByDow ?? Array(8).fill(0),
        existingStatus: existingByMentor.get(m.id) ?? null,
      };
    }),
  };
}

/** 후보 등록 — 같은 조합에 여러 명을 등록할 수 있다. */
export async function addCandidate(
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole("admin");

  const studentId = String(formData.get("studentId") ?? "");
  const mentorId = String(formData.get("mentorId") ?? "");
  const sessionTypeId = String(formData.get("sessionTypeId") ?? "");
  const rawSubjectId = String(formData.get("subjectId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const memo = String(formData.get("memo") ?? "").trim();
  const unitLabel = String(formData.get("progressUnitLabel") ?? "").trim();
  const totalRaw = String(formData.get("progressTotal") ?? "").trim();

  if (!studentId || !mentorId || !sessionTypeId || !startDate) {
    return { error: "학생·멘토·세션유형·시작일은 필수입니다." };
  }

  const supabase = await createClient();

  const { data: sessionType } = await supabase
    .from("session_types")
    .select("id, name, requires_subject, has_progress")
    .eq("id", sessionTypeId)
    .single();

  if (!sessionType) return { error: "세션유형을 찾을 수 없습니다." };

  if (sessionType.requires_subject && !rawSubjectId) {
    return { error: `"${sessionType.name}"은 과목을 선택해야 합니다.` };
  }

  const subjectId = sessionType.requires_subject ? rawSubjectId : null;

  // 같은 (학생, 멘토, 유형, 과목) 조합이 이미 살아있으면 중복 등록을 막는다
  let dupQuery = supabase
    .from("assignments")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("mentor_id", mentorId)
    .eq("session_type_id", sessionTypeId)
    .neq("status", "ended");

  dupQuery = subjectId
    ? dupQuery.eq("subject_id", subjectId)
    : dupQuery.is("subject_id", null);

  const { data: dup } = await dupQuery.limit(1);
  if (dup?.length) {
    return { error: "이 멘토는 같은 조합에 이미 등록되어 있습니다." };
  }

  const total = totalRaw ? Number(totalRaw) : null;

  const { error } = await supabase.from("assignments").insert({
    student_id: studentId,
    mentor_id: mentorId,
    session_type_id: sessionTypeId,
    subject_id: subjectId,
    status: "candidate",
    start_date: startDate,
    memo: memo || null,
    progress_unit_label: sessionType.has_progress ? unitLabel || null : null,
    progress_total:
      sessionType.has_progress && total && total > 0 ? total : null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/assignments");
  revalidatePath("/admin");
  return { error: null };
}

export interface ConfirmResult {
  ok: boolean;
  error?: string;
  /** 이미 확정된 배정이 있을 때 — 교체 여부를 물어보기 위한 정보 */
  conflict?: {
    id: string;
    mentorName: string;
    startDate: string;
  };
}

/**
 * 확정 전환. 같은 조합의 나머지 candidate는 DB 함수가 원자적으로 ended 처리한다.
 *
 * 이미 확정된 배정이 있으면 DB 제약 에러를 그대로 노출하지 않고
 * conflict 정보를 돌려준다 — 화면에서 "이미 확정된 배정이 있습니다" 안내와
 * 함께 교체할지 물어본다.
 */
export async function confirmAssignment(
  id: string,
  replace = false,
): Promise<ConfirmResult> {
  await requireRole("admin");
  if (!id) return { ok: false, error: "배정을 선택하세요." };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("confirm_assignment", {
    p_id: id,
    p_replace: replace,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;

  if (row?.ok) {
    revalidatePath("/admin/assignments");
    revalidatePath("/admin");
    return { ok: true };
  }

  const conflictId: string | undefined = row?.conflict_id ?? undefined;
  if (!conflictId) {
    return { ok: false, error: "확정에 실패했습니다." };
  }

  const { data: conflict } = await supabase
    .from("assignments")
    .select("id, start_date, mentors(name)")
    .eq("id", conflictId)
    .single();

  const mentorRel = conflict?.mentors as
    | { name: string }
    | { name: string }[]
    | null;
  const mentorName = Array.isArray(mentorRel)
    ? (mentorRel[0]?.name ?? "?")
    : (mentorRel?.name ?? "?");

  return {
    ok: false,
    conflict: {
      id: conflictId,
      mentorName,
      startDate: conflict?.start_date ?? "",
    },
  };
}

export async function updateCandidateMemo(
  formData: FormData,
): Promise<{ error: string | null }> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const memo = String(formData.get("memo") ?? "").trim();
  if (!id) return { error: "배정을 선택하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("assignments")
    .update({ memo: memo || null })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/assignments");
  return { error: null };
}

/** 후보 탈락 / 담당 종료 — 하드 삭제 대신 ended */
export async function endAssignment(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  await supabase
    .from("assignments")
    .update({ status: "ended", end_date: today })
    .eq("id", id);

  revalidatePath("/admin/assignments");
  revalidatePath("/admin");
}
