/**
 * 캘린더 빠른 입력 자연어 파서 (구글 캘린더 quick-add 스타일).
 *
 * 입력 예 → 제안:
 *  "김학생 국어 강기본 2강"        → 과제 (김학생 · 국어)
 *  "이학생 19:00-21:00 세션"       → 세션 (이학생 · 19:00~21:00)
 *  "김학생 세션 7시-9시"           → 세션
 *  "김학생 가족여행 ~8/5"          → 예외일정 (기간)
 *
 * 순수 함수 — 날짜는 클릭한 셀에서 받는다.
 */

export interface QuickAddContext {
  date: string; // 클릭한 날짜 (YYYY-MM-DD)
  students: { id: string; name: string }[];
  mentors: { id: string; name: string }[];
  /** 학생 필터가 1명으로 좁혀져 있으면 그 학생을 기본값으로 */
  defaultStudentId?: string;
  /** 역할별 허용 종류 (mentor는 예외일정 생성 불가 등) */
  allowSession?: boolean;
  allowException?: boolean;
}

export type QuickSuggestion =
  | {
      kind: "task";
      studentId: string;
      studentName: string;
      subject: string;
      content: string;
      label: string;
    }
  | {
      kind: "session";
      studentId: string;
      studentName: string;
      mentorId: string | null;
      mentorName: string | null;
      startTime: string;
      endTime: string;
      label: string;
    }
  | {
      kind: "exception";
      studentId: string;
      studentName: string;
      endDate: string;
      reason: string;
      label: string;
    }
  | { kind: "hint"; label: string };

const SUBJECTS = [
  "국어",
  "영어",
  "수학",
  "과학",
  "사회",
  "한국사",
  "물리",
  "화학",
  "생명",
  "지구과학",
  "탐구",
];

const SESSION_RE = /세션|수업|보강|과외|멘토링/;
const EXCEPTION_RE = /여행|예외|휴가|병원|불참|쉼|결석/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "19:00-21:00" / "19시~21시" / "7시-9시"(오후 해석) → [start, end] */
function parseTimeRange(input: string): [string, string] | null {
  let m = input.match(/(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/);
  if (m) return [`${pad(+m[1])}:${m[2]}`, `${pad(+m[3])}:${m[4]}`];

  m = input.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?\s*[~-]\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (m) {
    // 1~7시는 오후로 해석 (학원 수업 시간대)
    const h1 = +m[1] <= 7 ? +m[1] + 12 : +m[1];
    let h2 = +m[3] <= 7 ? +m[3] + 12 : +m[3];
    // 종료가 시작보다 이르면 오후로 보정 (예: 7시-9시 → 19:00~21:00)
    if (h2 <= h1 && h2 + 12 <= 24) h2 += 12;
    return [`${pad(h1)}:${pad(+m[2] || 0)}`, `${pad(h2)}:${pad(+m[4] || 0)}`];
  }
  return null;
}

/** "~8/5", "8/3-8/5" → 종료일 (클릭 날짜의 연도 기준) */
function parseEndDate(input: string, baseDate: string): string | null {
  const year = baseDate.slice(0, 4);
  const m =
    input.match(/[~-]\s*(\d{1,2})\/(\d{1,2})/) ??
    input.match(/(\d{1,2})\/(\d{1,2})\s*까지/);
  if (!m) return null;
  return `${year}-${pad(+m[1])}-${pad(+m[2])}`;
}

export function parseQuickAdd(
  input: string,
  ctx: QuickAddContext,
): QuickSuggestion[] {
  const text = input.trim();
  if (!text) return [];

  let rest = text;

  // 학생 매칭 (이름이 입력에 포함)
  const student =
    ctx.students.find((s) => rest.includes(s.name)) ??
    (ctx.defaultStudentId
      ? ctx.students.find((s) => s.id === ctx.defaultStudentId)
      : undefined);
  if (student) rest = rest.replace(student.name, " ");

  // 멘토 매칭 (세션용, 선택)
  const mentor = ctx.mentors.find((m) => rest.includes(m.name));
  if (mentor) rest = rest.replace(mentor.name, " ");

  const timeRange = parseTimeRange(rest);
  if (timeRange)
    rest = rest
      .replace(/(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/, " ")
      .replace(/(\d{1,2})\s*시(?:\s*\d{1,2}\s*분)?\s*[~-]\s*(\d{1,2})\s*시(?:\s*\d{1,2}\s*분)?/, " ");

  const wantsSession = SESSION_RE.test(rest) || timeRange !== null;
  const wantsException = EXCEPTION_RE.test(rest);
  const endDate = parseEndDate(rest, ctx.date);
  if (endDate) rest = rest.replace(/[~-]?\s*\d{1,2}\/\d{1,2}(\s*까지)?/, " ");

  // 과목 매칭
  const subject = SUBJECTS.find((s) => rest.includes(s)) ?? null;
  if (subject) rest = rest.replace(subject, " ");

  const content = rest
    .replace(SESSION_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!student) {
    return [
      {
        kind: "hint",
        label: "학생 이름을 포함해 주세요 (예: 김학생 국어 강기본 2강)",
      },
    ];
  }

  const suggestions: QuickSuggestion[] = [];

  // 세션 제안
  if (wantsSession && ctx.allowSession !== false) {
    const [start, end] = timeRange ?? ["19:00", "21:00"];
    suggestions.push({
      kind: "session",
      studentId: student.id,
      studentName: student.name,
      mentorId: mentor?.id ?? null,
      mentorName: mentor?.name ?? null,
      startTime: start,
      endTime: end,
      label: `📅 세션 — ${student.name} · ${ctx.date} ${start}~${end}${mentor ? ` · ${mentor.name}` : ""}`,
    });
  }

  // 예외일정 제안
  if (wantsException && ctx.allowException !== false) {
    const reason = EXCEPTION_RE.exec(text)?.[0] ?? "예외일정";
    suggestions.push({
      kind: "exception",
      studentId: student.id,
      studentName: student.name,
      endDate: endDate ?? ctx.date,
      reason: content || reason,
      label: `🚫 예외일정 — ${student.name} · ${ctx.date}${endDate && endDate !== ctx.date ? ` ~ ${endDate}` : ""} · ${content || reason} (과제 자동생성 제외)`,
    });
  }

  // 과제 제안 (내용이 있으면 항상 제시)
  if (content || subject) {
    suggestions.push({
      kind: "task",
      studentId: student.id,
      studentName: student.name,
      subject: subject ?? "기타",
      content: content || (subject ? `${subject} 학습` : ""),
      label: `✏️ 과제 — ${student.name} · ${subject ?? "기타"} · ${content || `${subject} 학습`}`,
    });
  }

  // 예외/세션 신호가 강하면 그쪽이 먼저 오도록 이미 순서 배치됨.
  // 아무것도 못 만들었으면 힌트.
  if (suggestions.length === 0) {
    suggestions.push({
      kind: "hint",
      label: "내용을 입력하세요 (과제) · 시간을 넣으면 세션 (예: 19:00-21:00)",
    });
  }

  return suggestions;
}
