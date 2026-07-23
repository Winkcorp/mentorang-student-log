import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mondayOf, plusDays } from "@/lib/dates";
import {
  ParentWeekView,
  type ChildWeek,
} from "@/components/ParentWeekView";

/**
 * 학부모 홈 — 주간 학습 그리드 (읽기 전용).
 *
 * 모든 조회는 anon key + 세션 쿠키(RLS 적용)로만 이루어진다.
 * sessions는 notes를 제외한 parent_sessions_view, 멘토는 이름·과목만
 * 노출하는 parent_mentors_view를 사용한다 — service_role 우회 경로 없음.
 */
export default async function ParentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const profile = await requireRole("parent");
  const params = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "")
    ? mondayOf(params.week!)
    : mondayOf(today);
  const sunday = plusDays(monday, 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => plusDays(monday, i));

  const supabase = await createClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, name, school, grade")
    .eq("parent_id", profile.parent_id!)
    .eq("status", "active")
    .order("name");

  const childIds = (children ?? []).map((c) => c.id);

  const [{ data: tasks }, { data: assignments }, { data: mentorNames }, { data: sessions }] =
    childIds.length
      ? await Promise.all([
          supabase
            .from("tasks")
            .select("id, student_id, date, subject, content, status, related_task_id")
            .in("student_id", childIds)
            .gte("date", monday)
            .lte("date", sunday)
            .order("date"),
          supabase
            .from("assignments")
            .select("student_id, mentor_id, subject, end_date")
            .in("student_id", childIds),
          supabase.from("parent_mentors_view").select("id, name"),
          supabase
            .from("parent_sessions_view")
            .select("id, student_id, mentor_id, date, start_time, end_time, status")
            .in("student_id", childIds)
            .gte("date", monday)
            .lte("date", sunday)
            .order("date"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const mentorNameById = new Map((mentorNames ?? []).map((m) => [m.id, m.name]));

  const childrenWeeks: ChildWeek[] = (children ?? []).map((child) => ({
    id: child.id,
    name: child.name,
    school: child.school,
    grade: child.grade,
    mentors: (assignments ?? [])
      .filter((a) => a.student_id === child.id && !a.end_date)
      .map((a) => ({
        name: mentorNameById.get(a.mentor_id) ?? "―",
        subject: a.subject,
      })),
    days: weekDates.map((date) => ({
      date,
      tasks: (tasks ?? [])
        .filter((t) => t.student_id === child.id && t.date === date)
        .map((t) => ({
          id: t.id,
          subject: t.subject,
          content: t.content,
          done: t.status === "done",
          linked: !!t.related_task_id,
        })),
      sessions: (sessions ?? [])
        .filter((s) => s.student_id === child.id && s.date === date)
        .map((s) => ({
          id: s.id,
          startTime: String(s.start_time),
          endTime: String(s.end_time),
          status: s.status,
          mentorName: mentorNameById.get(s.mentor_id) ?? null,
        })),
    })),
  }));

  return (
    <ParentWeekView
      monday={monday}
      sunday={sunday}
      today={today}
      childrenWeeks={childrenWeeks}
      prevHref={`/parent?week=${plusDays(monday, -7)}`}
      nextHref={`/parent?week=${plusDays(monday, 7)}`}
      todayHref="/parent"
    />
  );
}
