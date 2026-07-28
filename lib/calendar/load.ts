import type { CalendarEvent } from "@/components/calendar/CalendarBoard";
import { monthRange } from "@/lib/dates";

type Supabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

function rel<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * 캘린더 한 달치 데이터 로드 — tasks/sessions/exceptions를
 * CalendarEvent로 통합. RLS가 역할별 범위를 자동 적용한다
 * (mentor로 실행하면 담당 학생·본인 세션만 내려옴).
 */
export async function loadCalendarData(supabase: Supabase, ym: string) {
  const { start, end } = monthRange(ym);

  const [
    { data: tasks },
    { data: sessions },
    { data: exceptions },
    { data: students },
    { data: mentors },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, date, subject, content, status, related_task_id, student_id, students(name)",
      )
      .gte("date", start)
      .lte("date", end)
      .is("deleted_at", null),
    supabase
      .from("sessions")
      .select(
        "id, date, start_time, end_time, status, student_id, mentor_id, students(name), mentors(name)",
      )
      .gte("date", start)
      .lte("date", end)
      // 소프트 삭제된 세션은 캘린더에 남지 않아야 한다
      .is("deleted_at", null),
    supabase
      .from("exceptions")
      .select("id, student_id, start_date, end_date, reason, students(name)")
      .lte("start_date", end)
      .gte("end_date", start),
    supabase.from("students").select("id, name, school, grade").eq("status", "active").order("name"),
    supabase.from("mentors").select("id, name").eq("status", "active").order("name"),
    supabase.from("assignments").select("mentor_id, student_id"),
  ]);

  const events: CalendarEvent[] = [];

  for (const t of tasks ?? []) {
    events.push({
      id: t.id,
      kind: "task",
      date: t.date,
      title: t.content,
      subject: t.subject,
      status: t.status,
      studentId: t.student_id,
      studentName: rel(t.students)?.name ?? "",
      linked: !!t.related_task_id,
    });
  }

  for (const s of sessions ?? []) {
    events.push({
      id: s.id,
      kind: "session",
      date: s.date,
      title: `세션 ${SESSION_LABEL[s.status] ?? ""}`.trim(),
      status: s.status,
      studentId: s.student_id,
      studentName: rel(s.students)?.name ?? "",
      mentorId: s.mentor_id,
      mentorName: rel(s.mentors)?.name ?? null,
      startTime: String(s.start_time),
      endTime: String(s.end_time),
    });
  }

  // 예외일정은 기간을 날짜별로 펼쳐서 표시 (월 범위 내만)
  for (const e of exceptions ?? []) {
    const from = e.start_date < start ? start : e.start_date;
    const to = e.end_date > end ? end : e.end_date;
    const d = new Date(`${from}T00:00:00Z`);
    const last = new Date(`${to}T00:00:00Z`);
    while (d <= last) {
      const date = d.toISOString().slice(0, 10);
      events.push({
        id: `${e.id}:${date}`,
        kind: "exception",
        date,
        title: e.reason ?? "예외일정",
        studentId: e.student_id,
        studentName: e.student_id ? (rel(e.students)?.name ?? "") : "전체",
        spanStart: e.start_date,
        spanEnd: e.end_date,
        sourceId: e.id,
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  const mentorStudents: Record<string, string[]> = {};
  for (const a of assignments ?? []) {
    (mentorStudents[a.mentor_id] ??= []).push(a.student_id);
  }

  return {
    events,
    students: students ?? [],
    mentors: mentors ?? [],
    mentorStudents,
  };
}

const SESSION_LABEL: Record<string, string> = {
  completed: "",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체",
};

/**
 * 빠른 선택(템플릿 픽커) 목록 — 학습 템플릿 항목 + 최근 자주 쓴 과제 +
 * 대표 세션 시간대. 검색해서 클릭 한 번으로 등록하는 용도.
 */
export async function loadPresets(
  supabase: Supabase,
): Promise<import("@/components/calendar/CalendarBoard").Preset[]> {
  const [{ data: items }, { data: recent }] = await Promise.all([
    supabase
      .from("template_tasks")
      .select("id, subject, item_type, config")
      .limit(200),
    supabase
      .from("tasks")
      .select("subject, content")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const presets: import("@/components/calendar/CalendarBoard").Preset[] = [];
  const seen = new Set<string>();
  const pushTask = (subject: string, content: string) => {
    const key = `${subject}|${content}`;
    if (!content || seen.has(key)) return;
    seen.add(key);
    presets.push({
      id: `p${presets.length}`,
      kind: "task",
      subject,
      content,
      label: content,
    });
  };

  // 템플릿 항목에서
  for (const it of items ?? []) {
    const c = (it.config ?? {}) as Record<string, string>;
    if (it.item_type === "daily_routine") pushTask(it.subject, c.instruction);
    if (it.item_type === "conditional") {
      pushTask(it.subject, c.trigger);
      pushTask(it.subject, c.action);
    }
    if (it.item_type === "one_time") pushTask(it.subject, c.content);
  }

  // 최근 자주 등록한 과제 (빈도순 상위 15)
  const freq = new Map<string, { subject: string; content: string; n: number }>();
  for (const t of recent ?? []) {
    const key = `${t.subject}|${t.content}`;
    const cur = freq.get(key);
    if (cur) cur.n++;
    else freq.set(key, { subject: t.subject, content: t.content, n: 1 });
  }
  [...freq.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 15)
    .forEach((f) => pushTask(f.subject, f.content));

  // 대표 세션 시간대
  for (const [s, e] of [
    ["17:00", "19:00"],
    ["19:00", "21:00"],
    ["21:00", "22:30"],
  ] as const) {
    presets.push({
      id: `ps-${s}`,
      kind: "session",
      label: `세션 ${s}~${e}`,
      startTime: s,
      endTime: e,
    });
  }

  return presets.slice(0, 50);
}
