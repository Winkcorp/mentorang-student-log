import { mondayOf, plusDays } from "@/lib/dates";
import { byId, loadMasters } from "@/lib/masters/load";
import { sessionTitle } from "@/lib/sessions/title";
import { createClient } from "@/lib/supabase/server";
import { OperationsBoard } from "./OperationsBoard";
import type { OpsRow } from "./types";

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

/** 기본 조회 기간: 이번 주 월요일부터 4주 */
function defaultRange(): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const from = mondayOf(today);
  return { from, to: plusDays(from, 27) };
}

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const fallback = defaultRange();
  const from = params.from || fallback.from;
  const to = params.to || fallback.to;

  const supabase = await createClient();

  const [{ data: sessions }, { data: mentors }, { data: students }, masters] =
    await Promise.all([
      supabase
        .from("sessions")
        .select(
          "id, date, start_time, end_time, status, student_id, mentor_id, room_id, time_slot_id, series_id, week_number, students(name), mentors(name)",
        )
        .gte("date", from)
        .lte("date", to)
        .is("deleted_at", null)
        .order("date")
        .order("start_time"),
      supabase
        .from("mentors")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("students")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      loadMasters(),
    ]);

  const raw = sessions ?? [];

  // 세션 → 시리즈 → 배정 을 따라가며 세션유형·과목·총주차를 얻는다
  const seriesIds = [
    ...new Set(raw.map((s) => s.series_id).filter((v): v is string => !!v)),
  ];

  const { data: seriesRows } = seriesIds.length
    ? await supabase
        .from("session_series")
        .select("id, assignment_id, total_weeks")
        .in("id", seriesIds)
    : {
        data: [] as {
          id: string;
          assignment_id: string;
          total_weeks: number;
        }[],
      };

  const assignmentIds = [
    ...new Set((seriesRows ?? []).map((s) => s.assignment_id)),
  ];

  const { data: assignmentRows } = assignmentIds.length
    ? await supabase
        .from("assignments")
        .select("id, session_type_id, subject_id")
        .in("id", assignmentIds)
    : {
        data: [] as {
          id: string;
          session_type_id: string | null;
          subject_id: string | null;
        }[],
      };

  const seriesById = new Map((seriesRows ?? []).map((s) => [s.id, s]));
  const assignmentById = new Map((assignmentRows ?? []).map((a) => [a.id, a]));
  const sessionTypeById = byId(masters.sessionTypes);
  const timeSlotById = byId(masters.timeSlots);

  const rows: OpsRow[] = raw.map((s) => {
    const series = s.series_id ? seriesById.get(s.series_id) : null;
    const assignment = series ? assignmentById.get(series.assignment_id) : null;
    const sessionType = assignment?.session_type_id
      ? sessionTypeById.get(assignment.session_type_id)
      : null;

    const studentName = relName(s.students as never);
    const mentorName = relName(s.mentors as never);

    const title =
      sessionTitle({
        sessionTypeCode: sessionType?.code,
        date: s.date,
        timeSlotLabel: s.time_slot_id
          ? timeSlotById.get(s.time_slot_id)?.label
          : null,
        weekNumber: s.week_number,
        totalWeeks: series?.total_weeks,
        mentorName,
        studentName,
      }) || studentName;

    return {
      id: s.id,
      date: s.date,
      startTime: String(s.start_time).slice(0, 5),
      endTime: String(s.end_time).slice(0, 5),
      studentId: s.student_id,
      studentName,
      mentorId: s.mentor_id,
      mentorName,
      roomId: s.room_id,
      sessionTypeId: assignment?.session_type_id ?? null,
      subjectId: assignment?.subject_id ?? null,
      timeSlotId: s.time_slot_id,
      status: s.status,
      weekNumber: s.week_number,
      totalWeeks: series?.total_weeks ?? null,
      seriesId: s.series_id,
      title,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">운영</h1>
        <p className="mt-1 text-sm text-gray-500">
          기본은 표 뷰입니다. 세션이 몰리는 시간대를 볼 때는 일간 리소스 뷰로
          전환하세요 — 겹치는 세션이 포개지지 않고 나란히 표시됩니다.
        </p>
      </div>

      <OperationsBoard
        initialRows={rows}
        options={{
          mentors: mentors ?? [],
          students: students ?? [],
          rooms: masters.rooms,
          sessionTypes: masters.sessionTypes,
          subjects: masters.subjects,
          timeSlots: masters.timeSlots,
        }}
        from={from}
        to={to}
      />
    </div>
  );
}
