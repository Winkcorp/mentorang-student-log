/**
 * 출결 파생 — CLAUDE.md "출결 처리 규칙".
 *
 * 별도 출결 기록을 만들지 않고 sessions.status에서 계산한다.
 * 세션이 아예 없는 날만 attendance_overrides로 보완한다.
 */

export type AttendanceStatus = "present" | "partial" | "absent" | "none";

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "출석",
  partial: "부분출석",
  absent: "결석",
  none: "세션 없음",
};

export const ATTENDANCE_MARK: Record<AttendanceStatus, string> = {
  present: "○",
  partial: "△",
  absent: "✕",
  none: "·",
};

export const ATTENDANCE_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  absent: "bg-red-100 text-red-800",
  none: "bg-gray-50 text-gray-300",
};

/** 출석으로 세는 상태 */
const ATTENDED = ["completed", "makeup"];
/** 결석으로 세는 상태 */
const MISSED = ["no_show"];

/**
 * 하루치 세션들로부터 출결을 계산한다.
 *
 * - 취소(canceled)와 예정(scheduled)은 출결 판정에서 제외한다
 *   (아직 일어나지 않았거나, 학생 귀책이 아님)
 * - 판정 대상이 하나도 없으면 "none" — 이 경우에만 수동 입력을 허용한다
 */
export function deriveDailyAttendance(
  sessions: { status: string }[],
): AttendanceStatus {
  const attended = sessions.filter((s) => ATTENDED.includes(s.status)).length;
  const missed = sessions.filter((s) => MISSED.includes(s.status)).length;

  if (!attended && !missed) return "none";
  if (attended && missed) return "partial";
  return attended ? "present" : "absent";
}

export interface DayCell {
  date: string;
  status: AttendanceStatus;
  /** 수동 입력으로 채워진 칸인지 (표시를 구분하기 위해) */
  manual: boolean;
  /** 그날 세션 수 (판정 대상만) */
  sessionCount: number;
}

/**
 * 학생 한 명의 월간 출결.
 * 세션이 없는 날은 override를 찾아보고, 그것도 없으면 "none".
 */
export function buildMonthlyRow(
  dates: string[],
  sessionsByDate: Map<string, { status: string }[]>,
  overridesByDate: Map<string, AttendanceStatus>,
): DayCell[] {
  return dates.map((date) => {
    const sessions = sessionsByDate.get(date) ?? [];
    const derived = deriveDailyAttendance(sessions);

    if (derived !== "none") {
      return {
        date,
        status: derived,
        manual: false,
        sessionCount: sessions.filter(
          (s) => ATTENDED.includes(s.status) || MISSED.includes(s.status),
        ).length,
      };
    }

    const override = overridesByDate.get(date);
    return {
      date,
      status: override ?? "none",
      manual: !!override,
      sessionCount: 0,
    };
  });
}

/** 월간 출결 집계 (출석일/부분/결석일) */
export function summarize(cells: DayCell[]): Record<AttendanceStatus, number> {
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    partial: 0,
    absent: 0,
    none: 0,
  };
  for (const c of cells) counts[c.status] += 1;
  return counts;
}
