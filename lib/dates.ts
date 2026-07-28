/** "YYYY-MM" → 그 달의 시작일/말일 */
export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** 해당 날짜가 속한 주의 월요일 */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** 날짜 더하기 (YYYY-MM-DD) */
export function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 현재 시각을 읽는 헬퍼들.
 *
 * 컴포넌트 본문에서 Date.now()를 직접 부르면 렌더가 순수하지 않아
 * react-hooks/purity 규칙에 걸린다. 시각 계산은 여기로 모은다.
 */

/** 오늘 (YYYY-MM-DD) */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** n일 전 시각의 ISO 타임스탬프 — created_at 비교용 */
export function daysAgoTimestamp(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** 주어진 타임스탬프가 며칠 전인지 (내림) */
export function daysSince(timestamp: string): number {
  return Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 86_400_000,
  );
}

/** ISO-8601 요일: 1=월 … 7=일 (Postgres isodow, session_series.day_of_week와 동일) */
export function isoDow(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
  return day === 0 ? 7 : day;
}

/** ISO 요일 번호 → 한글 라벨. 인덱스 0은 쓰지 않는다(1=월). */
export const WEEKDAY_LABELS = ["", "월", "화", "수", "목", "금", "토", "일"];

/** 날짜 문자열 또는 ISO 요일 번호 → "화" */
export function weekdayLabel(dateOrDow: string | number): string {
  const dow = typeof dateOrDow === "number" ? dateOrDow : isoDow(dateOrDow);
  return WEEKDAY_LABELS[dow] ?? "";
}

/**
 * 시리즈 회차 날짜 목록.
 * start_date가 지정 요일이 아니면 start_date 이후 첫 해당 요일부터 시작한다.
 * (요일과 시작일이 어긋났을 때 조용히 1주를 날리지 않기 위함)
 */
export function seriesDates(
  startDate: string,
  dayOfWeek: number,
  totalWeeks: number,
): { weekNumber: number; date: string }[] {
  const offset = (dayOfWeek - isoDow(startDate) + 7) % 7;
  const first = plusDays(startDate, offset);
  return Array.from({ length: totalWeeks }, (_, i) => ({
    weekNumber: i + 1,
    date: plusDays(first, i * 7),
  }));
}

/** "HH:MM:SS" / "HH:MM" → "HH:MM" (문자열 비교로 시간 대소를 판단하기 위해 정규화) */
export function hhmm(time: string): string {
  return String(time).slice(0, 5);
}

/** 두 시간 구간이 겹치는지 (경계 접촉은 겹침이 아님 — 19:00 종료와 19:00 시작은 OK) */
export function timeOverlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return hhmm(aStart) < hhmm(bEnd) && hhmm(bStart) < hhmm(aEnd);
}

/** 두 날짜 사이의 모든 날짜 (양끝 포함) */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = plusDays(d, 1)) out.push(d);
  return out;
}

/** 이번 주 월~일 (YYYY-MM-DD) */
export function currentWeekRange(now = new Date()): {
  monday: string;
  sunday: string;
} {
  const d = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const offsetToMonday = (d.getUTCDay() + 6) % 7; // 월=0 ... 일=6
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  const monday = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const sunday = d.toISOString().slice(0, 10);
  return { monday, sunday };
}
