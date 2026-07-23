/**
 * 정산 계산 — 순수 함수 (CLAUDE.md "정산 규칙" 구현).
 *
 * 규칙 (개발용 초기값 — 정책 확정 시 CLAUDE.md와 함께 수정):
 *  - no_show(학생 귀책): 정산 "포함" (TBD 기본값)
 *  - canceled(멘토 귀책 등): 정산 제외
 *  - makeup(대체수업): 포함. related_session_id로 연결된 원 세션이
 *    함께 집계되는 이중 정산 금지 — 대체수업이 존재하는 원 세션은
 *    상태와 무관하게 집계에서 제외한다 (실제 진행된 세션 기준).
 *  - 부분 진행: start_time~end_time 실제 기록 시간 기준 (TBD)
 *  - 시간 계산: 분 단위로 집계 후 시간으로 환산, 소수 둘째 자리 반올림
 *    (예: 90분 → 1.50h, 100분 → 1.67h)
 *  - hourly: 진행시간 × rate_amount
 *  - per_session: 집계 세션 수 × rate_amount
 *  - flat: 기간 내 고정액 (세션 수와 무관, 단 기간 내 집계 세션이
 *    0개면 0원 — 활동 없는 기간에 고정액 지급 방지)
 */

export type RateType = "hourly" | "per_session" | "flat";

export interface SettlementSession {
  id: string;
  date: string;
  start_time: string; // "HH:MM" 또는 "HH:MM:SS"
  end_time: string;
  status: "completed" | "no_show" | "canceled" | "makeup";
  related_session_id: string | null;
}

export interface SettlementInput {
  rateType: RateType;
  rateAmount: number;
  sessions: SettlementSession[];
}

export interface SettlementResult {
  totalMinutes: number;
  totalHours: number; // 소수 둘째 자리
  totalSessions: number;
  amount: number; // 소수 둘째 자리
  countedSessionIds: string[];
  /** 대체수업으로 대체되어 제외된 원 세션 id */
  replacedSessionIds: string[];
}

/** 정산 집계 대상 상태 (canceled 제외) */
const COUNTED_STATUSES = new Set(["completed", "no_show", "makeup"]);

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateSettlement(input: SettlementInput): SettlementResult {
  const { rateType, rateAmount, sessions } = input;

  // 대체수업이 존재하는 원 세션은 제외 (이중 정산 금지)
  const replacedIds = new Set(
    sessions
      .filter((s) => s.status === "makeup" && s.related_session_id)
      .map((s) => s.related_session_id as string),
  );

  const counted = sessions.filter(
    (s) => COUNTED_STATUSES.has(s.status) && !replacedIds.has(s.id),
  );

  const totalMinutes = counted.reduce(
    (sum, s) => sum + minutesBetween(s.start_time, s.end_time),
    0,
  );
  const totalHours = round2(totalMinutes / 60);
  const totalSessions = counted.length;

  let amount: number;
  switch (rateType) {
    case "hourly":
      amount = round2(totalHours * rateAmount);
      break;
    case "per_session":
      amount = round2(totalSessions * rateAmount);
      break;
    case "flat":
      amount = totalSessions > 0 ? round2(rateAmount) : 0;
      break;
  }

  return {
    totalMinutes,
    totalHours,
    totalSessions,
    amount,
    countedSessionIds: counted.map((s) => s.id),
    replacedSessionIds: [...replacedIds],
  };
}
