import { weekdayLabel } from "@/lib/dates";

/**
 * 세션 제목·진도 표기 계산.
 *
 * CLAUDE.md "화면 표시 규칙": "공부습관GPT_화A_1주/4주_임태호M_주보경" 같은
 * 제목은 절대 저장하지 않는다. 구조화된 필드에서 매번 계산한다.
 * 이 파일 밖에서 제목 문자열을 조립하지 말 것.
 */

export interface SessionTitleParts {
  /** session_types.code (예: 공습, 국어PT) */
  sessionTypeCode?: string | null;
  /** 요일 계산용 — 세션 날짜 */
  date?: string | null;
  /** time_slots.label (A/B) */
  timeSlotLabel?: string | null;
  /** sessions.week_number */
  weekNumber?: number | null;
  /** session_series.total_weeks */
  totalWeeks?: number | null;
  mentorName?: string | null;
  studentName?: string | null;
}

/**
 * "공습_화A_1주/4주_박멘토M_김학생"
 * 값이 없는 구간은 통째로 빠진다 (빈 "_" 가 남지 않도록).
 */
export function sessionTitle(p: SessionTitleParts): string {
  const segments: string[] = [];

  if (p.sessionTypeCode) segments.push(p.sessionTypeCode);

  // 요일 + 시간대 라벨은 붙여서 한 덩어리 ("화A")
  const dayPart = p.date ? weekdayLabel(p.date) : "";
  const slotPart = p.timeSlotLabel ?? "";
  if (dayPart || slotPart) segments.push(`${dayPart}${slotPart}`);

  if (p.weekNumber) {
    segments.push(
      p.totalWeeks ? `${p.weekNumber}주/${p.totalWeeks}주` : `${p.weekNumber}주`,
    );
  }

  if (p.mentorName) segments.push(`${p.mentorName}M`);
  if (p.studentName) segments.push(p.studentName);

  return segments.join("_");
}

export interface ProgressParts {
  from?: number | null;
  to?: number | null;
  /** assignments.progress_total */
  total?: number | null;
  /** assignments.progress_unit_label (예: 강, 단원) */
  unitLabel?: string | null;
}

/**
 * "3~6강/40강" — 진도가 있는 세션유형(session_types.has_progress)만 표시.
 * 아직 입력 전이면 "3~?강/40강", 범위가 아예 없으면 null.
 */
export function progressLabel(p: ProgressParts): string | null {
  if (p.from == null && p.to == null) return null;

  const unit = p.unitLabel ?? "";
  const from = p.from ?? "?";
  const to = p.to ?? "?";
  const range = `${from}~${to}${unit}`;

  return p.total ? `${range}/${p.total}${unit}` : range;
}

/**
 * 다음 회차의 progress_from 기본값 — 직전 회차의 progress_to를 이어받는다.
 * 직전 회차가 없거나 진도 입력 전이면 null(= 사용자가 직접 입력).
 */
export function suggestNextProgressFrom(
  previousProgressTo: number | null | undefined,
): number | null {
  return previousProgressTo ?? null;
}
