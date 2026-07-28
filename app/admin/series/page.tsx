import Link from "next/link";
import { weekdayLabel } from "@/lib/dates";
import { byId, loadMasters } from "@/lib/masters/load";
import { createClient } from "@/lib/supabase/server";
import { SeriesForm, type AssignmentOption } from "./SeriesForm";

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

interface SeriesRow {
  id: string;
  assignment_id: string;
  time_slot_id: string;
  room_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  start_date: string;
  total_weeks: number;
  status: string;
}

export default async function AdminSeriesPage() {
  const supabase = await createClient();

  const [{ data: assignments }, { data: series }, masters] = await Promise.all([
    supabase
      .from("assignments")
      .select(
        "id, session_type_id, subject_id, students(name), mentors(name)",
      )
      .eq("status", "confirmed")
      .order("start_date", { ascending: false }),
    supabase
      .from("session_series")
      .select(
        "id, assignment_id, time_slot_id, room_id, day_of_week, start_time, end_time, start_date, total_weeks, status",
      )
      .is("deleted_at", null)
      .order("start_date", { ascending: false }),
    loadMasters(),
  ]);

  const sessionTypeById = byId(masters.sessionTypes);
  const subjectById = byId(masters.subjects);
  const timeSlotById = byId(masters.timeSlots);
  const roomById = byId(masters.rooms);

  const assignmentLabel = new Map<string, string>();
  const options: AssignmentOption[] = (assignments ?? []).map((a) => {
    const type = a.session_type_id
      ? sessionTypeById.get(a.session_type_id)?.name
      : null;
    const subject = a.subject_id ? subjectById.get(a.subject_id)?.name : null;
    const label = [
      relName(a.students),
      type ?? "유형 미지정",
      subject,
      `(${relName(a.mentors)})`,
    ]
      .filter(Boolean)
      .join(" · ");
    assignmentLabel.set(a.id, label);
    return { id: a.id, label };
  });

  const rows = (series ?? []) as SeriesRow[];

  // 회차 진행 상황 (살아있는 세션 기준)
  const { data: sessionCounts } = await supabase
    .from("sessions")
    .select("series_id, status")
    .not("series_id", "is", null)
    .is("deleted_at", null);

  const progress = new Map<string, { total: number; done: number }>();
  for (const s of sessionCounts ?? []) {
    const key = s.series_id as string;
    if (!progress.has(key)) progress.set(key, { total: 0, done: 0 });
    const p = progress.get(key)!;
    p.total += 1;
    if (s.status === "completed" || s.status === "makeup") p.done += 1;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">세션 시리즈</h1>
        <p className="mt-1 text-sm text-gray-500">
          반복 세션을 한 번에 생성합니다. 확정된 배정에만 만들 수 있고, 예외일정과
          겹치는 날짜는 건너뜁니다.
        </p>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          확정된 배정이 없습니다.{" "}
          <Link href="/admin/assignments" className="underline">
            배정 화면
          </Link>
          에서 후보를 확정한 뒤 시리즈를 만드세요.
        </div>
      ) : (
        <SeriesForm
          assignments={options}
          timeSlots={masters.timeSlots}
          rooms={masters.rooms}
        />
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          등록된 시리즈 ({rows.length})
        </h2>
        <ul className="space-y-2">
          {rows.map((s) => {
            const slot = timeSlotById.get(s.time_slot_id);
            const room = s.room_id ? roomById.get(s.room_id) : null;
            const p = progress.get(s.id);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    href={`/admin/series/${s.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {assignmentLabel.get(s.assignment_id) ?? "배정 정보 없음"}
                  </Link>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {weekdayLabel(s.day_of_week)}
                    {slot?.label ?? ""} {s.start_time.slice(0, 5)}~
                    {s.end_time.slice(0, 5)}
                  </span>
                  {room && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {room.name}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {s.start_date} · 총 {s.total_weeks}주
                  </span>
                  {s.status !== "active" && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                      {s.status === "ended" ? "종료" : "취소"}
                    </span>
                  )}
                </div>

                <div className="text-xs text-gray-500">
                  {p ? `${p.done}/${p.total} 회차 완료` : "회차 없음"}
                </div>
              </li>
            );
          })}
          {!rows.length && (
            <p className="text-sm text-gray-400">등록된 시리즈가 없습니다.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
