import Link from "next/link";
import { notFound } from "next/navigation";
import { weekdayLabel } from "@/lib/dates";
import { byId, loadMasters } from "@/lib/masters/load";
import {
  progressLabel,
  sessionTitle,
  suggestNextProgressFrom,
} from "@/lib/sessions/title";
import { createClient } from "@/lib/supabase/server";
import { SessionRowActions } from "./SessionRowActions";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  no_show: "bg-red-50 text-red-700",
  canceled: "bg-gray-100 text-gray-500",
  makeup: "bg-purple-50 text-purple-700",
};

/** 확정 회차 — 어떤 범위 선택에서도 변경되지 않는다 */
const LOCKED = ["completed", "no_show"];

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from("session_series")
    .select(
      "id, assignment_id, time_slot_id, room_id, day_of_week, start_time, end_time, start_date, total_weeks, status",
    )
    .eq("id", id)
    .single();

  if (!series) notFound();

  const [{ data: assignment }, { data: sessions }, masters] = await Promise.all([
    supabase
      .from("assignments")
      .select(
        "id, session_type_id, subject_id, progress_unit_label, progress_total, students(name), mentors(name)",
      )
      .eq("id", series.assignment_id)
      .single(),
    supabase
      .from("sessions")
      .select(
        "id, date, start_time, end_time, status, week_number, room_id, time_slot_id, progress_from, progress_to, notes",
      )
      .eq("series_id", id)
      .is("deleted_at", null)
      .order("date"),
    loadMasters(),
  ]);

  const sessionTypeById = byId(masters.sessionTypes);
  const subjectById = byId(masters.subjects);
  const timeSlotById = byId(masters.timeSlots);
  const roomById = byId(masters.rooms);

  const sessionType = assignment?.session_type_id
    ? sessionTypeById.get(assignment.session_type_id)
    : null;
  const subject = assignment?.subject_id
    ? subjectById.get(assignment.subject_id)
    : null;
  const slot = timeSlotById.get(series.time_slot_id);
  const studentName = relName(assignment?.students ?? null);
  const mentorName = relName(assignment?.mentors ?? null);

  const rows = sessions ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/series"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 시리즈 목록
        </Link>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {studentName} · {sessionType?.name ?? "유형 미지정"}
          {subject ? ` · ${subject.name}` : ""}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span>
            {weekdayLabel(series.day_of_week)}
            {slot?.label ?? ""} {series.start_time.slice(0, 5)}~
            {series.end_time.slice(0, 5)}
          </span>
          <span>·</span>
          <span>{mentorName} 멘토</span>
          <span>·</span>
          <span>
            {series.start_date} 시작 · 총 {series.total_weeks}주
          </span>
          {series.room_id && (
            <>
              <span>·</span>
              <span>{roomById.get(series.room_id)?.name}</span>
            </>
          )}
        </p>
      </div>

      <section>
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          회차 ({rows.length})
        </h2>
        <p className="mb-3 text-xs text-gray-400">
          제목은 저장하지 않고 세션유형·요일·시간대·주차·멘토·학생에서 계산합니다.
        </p>

        <ul className="space-y-2">
          {rows.map((s, index) => {
            const title = sessionTitle({
              sessionTypeCode: sessionType?.code,
              date: s.date,
              timeSlotLabel: s.time_slot_id
                ? timeSlotById.get(s.time_slot_id)?.label
                : slot?.label,
              weekNumber: s.week_number,
              totalWeeks: series.total_weeks,
              mentorName,
              studentName,
            });

            // 진도는 진도 관리 유형에서만 의미가 있다
            const progress = sessionType?.has_progress
              ? progressLabel({
                  from: s.progress_from,
                  to: s.progress_to,
                  total: assignment?.progress_total,
                  unitLabel: assignment?.progress_unit_label,
                })
              : null;

            // 직전 회차의 progress_to → 이 회차 progress_from 제안값
            const suggested =
              sessionType?.has_progress && s.progress_from == null
                ? suggestNextProgressFrom(rows[index - 1]?.progress_to)
                : null;

            const locked = LOCKED.includes(s.status);
            const room = s.room_id ? roomById.get(s.room_id) : null;

            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>
                      {s.date} {s.start_time.slice(0, 5)}~
                      {s.end_time.slice(0, 5)}
                    </span>
                    {room && <span>· {room.name}</span>}
                    {progress && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                        진도 {progress}
                      </span>
                    )}
                    {suggested != null && (
                      <span className="text-gray-400">
                        (직전 회차 이어서 {suggested}
                        {assignment?.progress_unit_label ?? ""}부터 제안)
                      </span>
                    )}
                  </div>
                </div>

                <SessionRowActions
                  seriesId={id}
                  sessionId={s.id}
                  startTime={s.start_time}
                  endTime={s.end_time}
                  roomId={s.room_id}
                  rooms={masters.rooms}
                  locked={locked}
                />
              </li>
            );
          })}
          {!rows.length && (
            <p className="text-sm text-gray-400">
              남아있는 회차가 없습니다 (모두 삭제됨).
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
