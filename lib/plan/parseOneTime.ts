import { DAY_OF_WEEK, type DayOfWeek } from "./config";

/**
 * GPT 학습플랜 표(주차/요일/과목/내용) 붙여넣기 → one_time 항목 일괄 파싱.
 *
 * 지원 형식: 탭(TSV)/파이프(|)/쉼표 구분, 한 줄당 한 항목.
 *   1주 \t 토 \t 국어 \t 모의고사 기출 1회분
 *   2 | sat | 수학 | 마플 4단원 테스트
 *
 * 형식이 안 맞는 행은 조용히 무시하지 않고 몇 번째 행이 왜 실패했는지 반환한다.
 */

export interface ParsedOneTimeRow {
  line: number; // 1부터 (원본 표시용)
  week_number: number;
  day_of_week: DayOfWeek;
  subject: string;
  content: string;
}

export interface ParseError {
  line: number;
  raw: string;
  reason: string;
}

const KO_DAY_MAP: Record<string, DayOfWeek> = {
  월: "mon",
  화: "tue",
  수: "wed",
  목: "thu",
  금: "fri",
  토: "sat",
  일: "sun",
};

function parseDay(raw: string): DayOfWeek | null {
  const v = raw.trim().toLowerCase();
  // "월", "월요일"
  const koChar = raw.trim().charAt(0);
  if (KO_DAY_MAP[koChar] && (raw.trim().length === 1 || raw.includes("요일")))
    return KO_DAY_MAP[koChar];
  if (KO_DAY_MAP[raw.trim()]) return KO_DAY_MAP[raw.trim()];
  // "mon", "monday"
  const en = DAY_OF_WEEK.find((d) => v === d || v.startsWith(d));
  return en ?? null;
}

function parseWeek(raw: string): number | null {
  // "1", "1주", "1주차", "week 1"
  const m = raw.trim().match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseOneTimeTable(text: string): {
  rows: ParsedOneTimeRow[];
  errors: ParseError[];
} {
  const rows: ParsedOneTimeRow[] = [];
  const errors: ParseError[] = [];

  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, i) => {
    const line = i + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return; // 빈 줄은 스킵 (에러 아님)

    // 구분자: 탭 우선, 없으면 파이프, 없으면 쉼표
    let cells: string[];
    if (trimmed.includes("\t")) cells = trimmed.split("\t");
    else if (trimmed.includes("|")) cells = trimmed.split("|");
    else cells = trimmed.split(",");
    cells = cells.map((c) => c.trim()).filter((c) => c.length > 0);

    // 헤더 행 감지 ("주차", "요일" 등) → 스킵
    if (
      line === 1 &&
      cells.some((c) => /주차|요일|과목|내용|week|day|subject|content/i.test(c)) &&
      parseWeek(cells[0] ?? "") === null
    )
      return;

    if (cells.length < 4) {
      errors.push({
        line,
        raw: trimmed,
        reason: `열이 ${cells.length}개입니다 — 주차/요일/과목/내용 4개가 필요합니다.`,
      });
      return;
    }

    const [weekRaw, dayRaw, subject, ...contentParts] = cells;
    const week = parseWeek(weekRaw);
    const day = parseDay(dayRaw);
    const content = contentParts.join(" ").trim();

    if (week === null) {
      errors.push({ line, raw: trimmed, reason: `주차를 해석할 수 없습니다: "${weekRaw}"` });
      return;
    }
    if (day === null) {
      errors.push({ line, raw: trimmed, reason: `요일을 해석할 수 없습니다: "${dayRaw}"` });
      return;
    }
    if (!subject) {
      errors.push({ line, raw: trimmed, reason: "과목이 비어 있습니다." });
      return;
    }
    if (!content) {
      errors.push({ line, raw: trimmed, reason: "내용이 비어 있습니다." });
      return;
    }

    rows.push({ line, week_number: week, day_of_week: day, subject, content });
  });

  return { rows, errors };
}
