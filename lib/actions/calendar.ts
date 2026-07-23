"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { QuickCreatePayload } from "@/components/calendar/CalendarBoard";

/**
 * 통합 캘린더 서버 액션 — admin/mentor 공용.
 * 세부 접근 제어는 RLS가 최종 방어선 (mentor는 담당 학생·본인 세션만).
 */

type Result = { error: string | null };

function revalidateCalendars() {
  revalidatePath("/admin/calendar");
  revalidatePath("/mentor/calendar");
}

export async function calendarQuickCreate(
  payload: QuickCreatePayload,
): Promise<Result> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent")
    return { error: "권한이 없습니다." };

  const { suggestion: s, date, repeatUntil } = payload;
  const supabase = await createClient();

  if (s.kind === "task") {
    // 기간 반복: date ~ repeatUntil 매일 (최대 62일 안전장치)
    const dates: string[] = [];
    if (repeatUntil && repeatUntil > date) {
      let d = date;
      while (d <= repeatUntil && dates.length < 62) {
        dates.push(d);
        const next = new Date(`${d}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        d = next.toISOString().slice(0, 10);
      }
    } else {
      dates.push(date);
    }

    const { error } = await supabase.from("tasks").insert(
      dates.map((d) => ({
        student_id: s.studentId,
        date: d,
        subject: s.subject,
        content: s.content,
        status: "planned",
      })),
    );
    if (error) return { error: `과제 등록 실패: ${error.message}` };
    revalidateCalendars();
    return { error: null };
  }

  if (s.kind === "session") {
    // 멘토 결정: mentor 역할이면 본인, admin은 입력된 멘토 →
    // 없으면 해당 학생의 활성 배정 멘토를 자동 연결 (유기적 연결)
    let mentorId =
      profile.role === "mentor" ? profile.mentor_id : s.mentorId;
    if (!mentorId) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: assignment } = await supabase
        .from("assignments")
        .select("mentor_id")
        .eq("student_id", s.studentId)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .limit(1)
        .maybeSingle();
      mentorId = assignment?.mentor_id ?? null;
    }
    if (!mentorId)
      return {
        error:
          "이 학생의 담당 멘토가 없습니다. 입력에 멘토 이름을 포함하거나 배정을 먼저 해주세요.",
      };

    const { error } = await supabase.from("sessions").insert({
      student_id: s.studentId,
      mentor_id: mentorId,
      date,
      start_time: s.startTime,
      end_time: s.endTime,
      status: "completed",
    });
    if (error) return { error: `세션 등록 실패: ${error.message}` };
    revalidateCalendars();
    return { error: null };
  }

  if (s.kind === "exception") {
    if (profile.role !== "admin")
      return { error: "예외일정은 관리자만 등록할 수 있습니다." };
    const { error } = await supabase.from("exceptions").insert({
      student_id: s.studentId,
      start_date: date,
      end_date: s.endDate < date ? date : s.endDate,
      reason: s.reason,
    });
    if (error) return { error: `예외일정 등록 실패: ${error.message}` };
    revalidateCalendars();
    return { error: null };
  }

  return { error: "알 수 없는 항목입니다." };
}

export async function calendarToggleTask(
  id: string,
  done: boolean,
): Promise<Result> {
  // 반응형 생성(복습/조건부 액션) 로직 재사용
  const { toggleTask } = await import("@/lib/actions/tasks");
  const r = await toggleTask(id, done);
  revalidateCalendars();
  return { error: r.error };
}

export async function calendarSetSessionStatus(
  id: string,
  status: "completed" | "no_show" | "canceled",
): Promise<Result> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent")
    return { error: "권한이 없습니다." };
  if (!["completed", "no_show", "canceled"].includes(status))
    return { error: "잘못된 상태입니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "변경 권한이 없거나 세션이 없습니다." };

  revalidatePath("/mentor/sessions");
  revalidateCalendars();
  return { error: null };
}

export async function calendarUpdateTask(
  id: string,
  patch: { subject: string; content: string },
): Promise<Result> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent")
    return { error: "권한이 없습니다." };

  const subject = patch.subject.trim();
  const content = patch.content.trim();
  if (!subject || !content) return { error: "과목과 내용을 입력하세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ subject, content })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "수정 권한이 없거나 과제가 없습니다." };

  revalidateCalendars();
  return { error: null };
}

export async function calendarDeleteTask(id: string): Promise<Result> {
  const profile = await getProfile();
  if (!profile?.role || profile.role === "parent")
    return { error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "삭제 권한이 없거나 과제가 없습니다." };

  revalidateCalendars();
  return { error: null };
}

export async function calendarDeleteException(id: string): Promise<Result> {
  const profile = await getProfile();
  if (profile?.role !== "admin")
    return { error: "예외일정은 관리자만 삭제할 수 있습니다." };

  const supabase = await createClient();
  const { error } = await supabase.from("exceptions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidateCalendars();
  return { error: null };
}
