import { requireRole } from "@/lib/auth";
import { byId, loadMasters } from "@/lib/masters/load";
import {
  progressLabel,
  sessionTitle,
  suggestNextProgressFrom,
} from "@/lib/sessions/title";
import { createClient } from "@/lib/supabase/server";
import {
  MentorSessionList,
  type MentorSessionRow,
} from "./MentorSessionList";
import { createSession } from "./actions";

const inputCls =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

export default async function MentorSessionsPage() {
  const profile = await requireRole("mentor");
  const supabase = await createClient();

  const [{ data: sessions }, { data: assignmentRows }, masters] =
    await Promise.all([
      supabase
        .from("sessions")
        .select(
          "id, date, start_time, end_time, status, notes, related_session_id, series_id, time_slot_id, week_number, progress_from, progress_to, students(id, name)",
        )
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .order("start_time")
        .limit(100),
      profile.mentor_id
        ? supabase
            .from("assignments")
            .select("student_id, students(id, name)")
            .eq("mentor_id", profile.mentor_id)
            .eq("status", "confirmed")
        : Promise.resolve({ data: [] as never[] }),
      loadMasters(),
    ]);

  const rows = sessions ?? [];

  // 시리즈 → 배정 → 세션유형 을 따라가며 제목·진도 계산에 필요한 정보를 모은다
  const seriesIds = [
    ...new Set(rows.map((s) => s.series_id).filter((v): v is string => !!v)),
  ];

  const { data: seriesRows } = seriesIds.length
    ? await supabase
        .from("session_series")
        .select("id, assignment_id, total_weeks")
        .in("id", seriesIds)
    : { data: [] as { id: string; assignment_id: string; total_weeks: number }[] };

  const assignmentIds = [
    ...new Set((seriesRows ?? []).map((s) => s.assignment_id)),
  ];

  const { data: assignmentInfo } = assignmentIds.length
    ? await supabase
        .from("assignments")
        .select(
          "id, session_type_id, progress_unit_label, progress_total, mentors(name)",
        )
        .in("id", assignmentIds)
    : {
        data: [] as {
          id: string;
          session_type_id: string | null;
          progress_unit_label: string | null;
          progress_total: number | null;
          mentors: { name: string } | { name: string }[] | null;
        }[],
      };

  const seriesById = new Map((seriesRows ?? []).map((s) => [s.id, s]));
  const assignmentById = new Map((assignmentInfo ?? []).map((a) => [a.id, a]));
  const sessionTypeById = byId(masters.sessionTypes);
  const timeSlotById = byId(masters.timeSlots);

  // 시리즈별 회차를 날짜 오름차순으로 — 직전 회차의 progress_to를 찾기 위해
  const bySeriesAsc = new Map<string, typeof rows>();
  for (const s of rows) {
    if (!s.series_id) continue;
    if (!bySeriesAsc.has(s.series_id)) bySeriesAsc.set(s.series_id, []);
    bySeriesAsc.get(s.series_id)!.push(s);
  }
  for (const list of bySeriesAsc.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  // 이미 대체수업이 연결된 원 세션 id
  const replacedIds = new Set(
    rows
      .filter((s) => s.status === "makeup" && s.related_session_id)
      .map((s) => s.related_session_id as string),
  );

  const listRows: MentorSessionRow[] = rows.map((s) => {
    const series = s.series_id ? seriesById.get(s.series_id) : null;
    const assignment = series ? assignmentById.get(series.assignment_id) : null;
    const sessionType = assignment?.session_type_id
      ? sessionTypeById.get(assignment.session_type_id)
      : null;
    const studentName = relName(s.students as never);

    const title = sessionTitle({
      sessionTypeCode: sessionType?.code,
      date: s.date,
      timeSlotLabel: s.time_slot_id
        ? timeSlotById.get(s.time_slot_id)?.label
        : null,
      weekNumber: s.week_number,
      totalWeeks: series?.total_weeks,
      mentorName: assignment ? relName(assignment.mentors) : null,
      studentName,
    });

    let progress: MentorSessionRow["progress"] = null;
    if (sessionType?.has_progress) {
      // 같은 시리즈에서 이 회차 직전 회차의 종료 진도
      const siblings = s.series_id ? (bySeriesAsc.get(s.series_id) ?? []) : [];
      const index = siblings.findIndex((x) => x.id === s.id);
      const previousTo = index > 0 ? siblings[index - 1].progress_to : null;

      progress = {
        from: s.progress_from,
        to: s.progress_to,
        total: assignment?.progress_total ?? null,
        unitLabel: assignment?.progress_unit_label ?? null,
        suggestedFrom:
          s.progress_from == null ? suggestNextProgressFrom(previousTo) : null,
        label: progressLabel({
          from: s.progress_from,
          to: s.progress_to,
          total: assignment?.progress_total,
          unitLabel: assignment?.progress_unit_label,
        }),
      };
    }

    return {
      id: s.id,
      date: s.date,
      startTime: String(s.start_time).slice(0, 5),
      endTime: String(s.end_time).slice(0, 5),
      status: s.status,
      notes: s.notes,
      relatedSessionId: s.related_session_id,
      hasMakeup: replacedIds.has(s.id),
      studentName,
      // 시리즈 밖의 단발 세션은 제목 재료가 없으니 학생명만 남는다
      title: title || studentName,
      progress,
    };
  });

  const students = new Map<string, string>();
  for (const a of assignmentRows ?? []) {
    const s = Array.isArray(a.students) ? a.students[0] : a.students;
    if (s) students.set(s.id, s.name);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold text-gray-900">세션 관리</h1>
        <p className="text-sm text-gray-500">
          한 번의 탭으로 상태를 바꾸거나, 여러 건을 선택해 한꺼번에 처리할 수
          있습니다. 취소 세션은 대체수업을 연결할 수 있습니다.
        </p>
      </div>

      <form
        action={createSession}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/70 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            학생 *
          </label>
          <select name="studentId" required className={inputCls}>
            <option value="">선택</option>
            {[...students.entries()].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            날짜 *
          </label>
          <input name="date" type="date" required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            시작 *
          </label>
          <input name="startTime" type="time" required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            종료 *
          </label>
          <input name="endTime" type="time" required className={inputCls} />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          세션 기록
        </button>
      </form>

      <MentorSessionList sessions={listRows} />
    </div>
  );
}
