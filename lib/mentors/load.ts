import { isoDow, WEEKDAY_LABELS } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * 멘토 과부하 판단용 지표.
 * 배정 후보 목록에서 "이 멘토를 더 붙여도 되는가"를 눈으로 판단하게 한다.
 */
export interface MentorLoad {
  /** 확정(confirmed) 배정 기준 담당 학생 수 — 중복 제거 */
  studentCount: number;
  /** ISO 요일별(1=월…7=일) 예정·진행 세션 수. index 0은 쓰지 않는다. */
  sessionsByDow: number[];
  /** 요일별 세션 수를 "월2 화3" 형태로 */
  dowSummary: string;
}

const EMPTY: MentorLoad = {
  studentCount: 0,
  sessionsByDow: Array(8).fill(0),
  dowSummary: "",
};

export function formatDowSummary(sessionsByDow: number[]): string {
  return WEEKDAY_LABELS.map((label, dow) =>
    dow >= 1 && sessionsByDow[dow] ? `${label}${sessionsByDow[dow]}` : null,
  )
    .filter(Boolean)
    .join(" ");
}

/**
 * 여러 멘토의 부하를 한 번에. 후보 목록이 N명이어도 쿼리는 2번이다.
 *
 * 세션 집계는 오늘 이후(취소·삭제 제외)만 센다 — 과거 이력은 지금 과부하
 * 판단과 무관하다.
 */
export async function loadMentorLoads(
  mentorIds: string[],
  today = new Date().toISOString().slice(0, 10),
): Promise<Map<string, MentorLoad>> {
  const result = new Map<string, MentorLoad>();
  if (!mentorIds.length) return result;

  const supabase = await createClient();

  const [assignmentsRes, sessionsRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("mentor_id, student_id")
      .in("mentor_id", mentorIds)
      .eq("status", "confirmed"),
    supabase
      .from("sessions")
      .select("mentor_id, date")
      .in("mentor_id", mentorIds)
      .is("deleted_at", null)
      .in("status", ["scheduled", "completed", "makeup"])
      .gte("date", today),
  ]);

  const students = new Map<string, Set<string>>();
  for (const a of assignmentsRes.data ?? []) {
    if (!students.has(a.mentor_id)) students.set(a.mentor_id, new Set());
    students.get(a.mentor_id)!.add(a.student_id);
  }

  const dows = new Map<string, number[]>();
  for (const s of sessionsRes.data ?? []) {
    if (!dows.has(s.mentor_id)) dows.set(s.mentor_id, Array(8).fill(0));
    dows.get(s.mentor_id)![isoDow(s.date)] += 1;
  }

  for (const id of mentorIds) {
    const sessionsByDow = dows.get(id) ?? [...EMPTY.sessionsByDow];
    result.set(id, {
      studentCount: students.get(id)?.size ?? 0,
      sessionsByDow,
      dowSummary: formatDowSummary(sessionsByDow),
    });
  }

  return result;
}
