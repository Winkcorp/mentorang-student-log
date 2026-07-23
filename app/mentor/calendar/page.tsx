import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCalendarData } from "@/lib/calendar/load";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";
import {
  calendarDeleteTask,
  calendarQuickCreate,
  calendarSetSessionStatus,
  calendarToggleTask,
} from "@/lib/actions/calendar";

export default async function MentorCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireRole("mentor");

  const params = await searchParams;
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentYm;

  // RLS가 담당 학생·본인 세션으로 자동 제한
  const supabase = await createClient();
  const data = await loadCalendarData(supabase, ym);

  return (
    <CalendarBoard
      ym={ym}
      events={data.events}
      students={data.students}
      mentors={data.mentors}
      mentorStudents={data.mentorStudents}
      role="mentor"
      monthBasePath="/mentor/calendar"
      studentTasksBase="/mentor/students"
      actions={{
        quickCreate: calendarQuickCreate,
        toggleTask: calendarToggleTask,
        setSessionStatus: calendarSetSessionStatus,
        deleteTask: calendarDeleteTask,
      }}
    />
  );
}
