import { createClient } from "@/lib/supabase/server";
import type {
  ConflictContext,
  ExistingSession,
  RoomBlockWindow,
} from "./conflicts";

/**
 * 충돌 검사에 필요한 컨텍스트를 DB에서 모아온다.
 * (판정 로직은 conflicts.ts의 순수 함수 — 이 파일은 조회만 담당)
 *
 * 조회 범위를 해당 날짜들로 좁힌다. 시리즈 4주면 4일치만 읽으면 되고,
 * 전체 세션을 긁어오면 학생·멘토가 늘수록 느려진다.
 */
export async function loadConflictContext(
  dates: string[],
): Promise<ConflictContext> {
  const supabase = await createClient();

  if (!dates.length) {
    return { existing: [], roomBlocks: [], rooms: [] };
  }

  const uniqueDates = [...new Set(dates)].sort();
  const from = uniqueDates[0];
  const to = uniqueDates[uniqueDates.length - 1];

  const [sessionsRes, blocksRes, roomsRes, mentorsRes, studentsRes] =
    await Promise.all([
      supabase
        .from("sessions")
        .select(
          "id, mentor_id, student_id, room_id, date, start_time, end_time, status, deleted_at",
        )
        .gte("date", from)
        .lte("date", to)
        .is("deleted_at", null)
        .neq("status", "canceled"),
      supabase
        .from("room_blocks")
        .select("room_id, date, start_time, end_time, reason")
        .gte("date", from)
        .lte("date", to),
      supabase.from("rooms").select("id, name, capacity"),
      supabase.from("mentors").select("id, name"),
      supabase.from("students").select("id, name"),
    ]);

  // 범위 조회로 가져온 뒤 실제 대상 날짜만 남긴다
  // (시리즈는 주 1회라 사이 날짜는 볼 필요가 없다)
  const wanted = new Set(uniqueDates);

  const nameMap = (rows: { id: string; name: string }[] | null) =>
    Object.fromEntries((rows ?? []).map((r) => [r.id, r.name]));

  return {
    existing: ((sessionsRes.data ?? []) as ExistingSession[]).filter((s) =>
      wanted.has(s.date),
    ),
    roomBlocks: ((blocksRes.data ?? []) as RoomBlockWindow[]).filter((b) =>
      wanted.has(b.date),
    ),
    rooms: (roomsRes.data ?? []) as ConflictContext["rooms"],
    mentorNames: nameMap(mentorsRes.data),
    studentNames: nameMap(studentsRes.data),
  };
}

/**
 * 학생별 예외 기간(suppress_generation)에 걸리는 날짜 집합.
 * student_id가 null인 예외는 전체(학원 단위) 예외로 모든 학생에게 적용된다.
 */
export async function loadSuppressedDates(
  studentId: string,
  dates: string[],
): Promise<Set<string>> {
  if (!dates.length) return new Set();

  const supabase = await createClient();
  const sorted = [...dates].sort();

  const { data } = await supabase
    .from("exceptions")
    .select("start_date, end_date, student_id")
    .eq("suppress_generation", true)
    .or(`student_id.eq.${studentId},student_id.is.null`)
    .lte("start_date", sorted[sorted.length - 1])
    .gte("end_date", sorted[0]);

  const suppressed = new Set<string>();
  for (const d of dates) {
    if ((data ?? []).some((e) => d >= e.start_date && d <= e.end_date)) {
      suppressed.add(d);
    }
  }
  return suppressed;
}
