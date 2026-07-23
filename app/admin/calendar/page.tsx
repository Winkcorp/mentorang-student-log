import { createClient } from "@/lib/supabase/server";
import { loadCalendarData } from "@/lib/calendar/load";
import { CalendarBoard } from "@/components/calendar/CalendarBoard";
import {
  calendarDeleteException,
  calendarDeleteTask,
  calendarQuickCreate,
  calendarSetSessionStatus,
  calendarToggleTask,
} from "@/lib/actions/calendar";

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentYm;

  const supabase = await createClient();
  const data = await loadCalendarData(supabase, ym);

  return (
    <CalendarBoard
      ym={ym}
      events={data.events}
      students={data.students}
      mentors={data.mentors}
      mentorStudents={data.mentorStudents}
      role="admin"
      monthBasePath="/admin/calendar"
      studentTasksBase="/admin/students"
      actions={{
        quickCreate: calendarQuickCreate,
        toggleTask: calendarToggleTask,
        setSessionStatus: calendarSetSessionStatus,
        deleteTask: calendarDeleteTask,
        deleteException: calendarDeleteException,
      }}
    />
  );
}
