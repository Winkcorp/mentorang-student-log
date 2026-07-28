import type { Room, SessionType, Subject, TimeSlot } from "@/lib/masters/types";

/** 운영 화면의 한 행. 제목은 저장값이 아니라 서버에서 계산해 넣은 값이다. */
export interface OpsRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  studentId: string;
  studentName: string;
  mentorId: string;
  mentorName: string;
  roomId: string | null;
  sessionTypeId: string | null;
  subjectId: string | null;
  timeSlotId: string | null;
  status: string;
  weekNumber: number | null;
  totalWeeks: number | null;
  seriesId: string | null;
  title: string;
}

export interface OpsOptions {
  mentors: { id: string; name: string }[];
  students: { id: string; name: string }[];
  rooms: Room[];
  sessionTypes: SessionType[];
  subjects: Subject[];
  timeSlots: TimeSlot[];
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "예정",
  completed: "완료",
  no_show: "노쇼",
  canceled: "취소",
  makeup: "대체수업",
};

export const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  no_show: "bg-red-50 text-red-700",
  canceled: "bg-gray-100 text-gray-500",
  makeup: "bg-purple-50 text-purple-700",
};

export const STATUS_ORDER = [
  "scheduled",
  "completed",
  "no_show",
  "canceled",
  "makeup",
];

/** "HH:MM" → 자정 기준 분 */
export function toMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/** 자정 기준 분 → "HH:MM" */
export function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
