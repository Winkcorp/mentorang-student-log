import type {
  ConditionalConfig,
  DailyRoutineConfig,
  DayOfWeek,
  ItemType,
  OneTimeConfig,
  SequentialConfig,
} from "./config";
import { DAY_OF_WEEK } from "./config";

/**
 * 템플릿 배정 시 tasks 생성 — 순수 날짜 계산 (DB 접근 없음, 테스트 대상).
 *
 * 날짜는 전부 "YYYY-MM-DD" 문자열로 다룬다 (타임존 사고 방지).
 */

export interface ExceptionPeriod {
  student_id: string | null; // null = 학원 전체
  start_date: string;
  end_date: string;
  suppress_generation: boolean;
}

export interface TemplateItem {
  id: string;
  subject_id: string;
  item_type: ItemType;
  config: Record<string, unknown>;
}

export interface GeneratedTask {
  date: string;
  subject_id: string;
  content: string;
  source_template_task_id: string;
}

// ---------- 날짜 유틸 ----------

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isMonday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

/** 배정 기간의 모든 날짜 (startDate는 월요일, durationWeeks * 7일) */
export function periodDates(startDate: string, durationWeeks: number): string[] {
  return Array.from({ length: durationWeeks * 7 }, (_, i) =>
    addDays(startDate, i),
  );
}

/** 해당 날짜가 이 학생의 suppress_generation 예외 기간에 포함되는가 */
export function isExcludedDate(
  date: string,
  studentId: string,
  exceptions: ExceptionPeriod[],
): boolean {
  return exceptions.some(
    (e) =>
      e.suppress_generation &&
      (e.student_id === null || e.student_id === studentId) &&
      e.start_date <= date &&
      date <= e.end_date,
  );
}

/** 예외 기간과 겹치면 다음 가용일로 미룬다 */
export function nextAvailableDate(
  date: string,
  studentId: string,
  exceptions: ExceptionPeriod[],
): string {
  let d = date;
  // 예외 기간이 아무리 길어도 종료 지점이 있으므로 유한 루프
  let guard = 0;
  while (isExcludedDate(d, studentId, exceptions) && guard < 366) {
    d = addDays(d, 1);
    guard++;
  }
  return d;
}

// ---------- item_type별 생성 ----------

function generateDailyRoutine(
  item: TemplateItem,
  dates: string[],
  studentId: string,
  exceptions: ExceptionPeriod[],
): GeneratedTask[] {
  const config = item.config as unknown as DailyRoutineConfig;
  return dates
    .filter((d) => !isExcludedDate(d, studentId, exceptions))
    .map((date) => ({
      date,
      subject_id: item.subject_id,
      content: config.instruction,
      source_template_task_id: item.id,
    }));
}

/**
 * sequential: 가용일(예외 제외) 기준으로 period_days마다 범위를 전진.
 * 예외 기간에는 일정이 "일시정지"되고 이후 이어서 진행된다 — 범위가 유실되지 않음.
 */
function generateSequential(
  item: TemplateItem,
  dates: string[],
  studentId: string,
  exceptions: ExceptionPeriod[],
): GeneratedTask[] {
  const config = item.config as unknown as SequentialConfig;
  const available = dates.filter(
    (d) => !isExcludedDate(d, studentId, exceptions),
  );

  const tasks: GeneratedTask[] = [];
  let unit = config.start_unit;

  for (let i = 0; i < available.length; i += config.period_days) {
    if (config.total_units && unit > config.total_units) break;

    const endUnit = config.total_units
      ? Math.min(unit + config.units_per_period - 1, config.total_units)
      : unit + config.units_per_period - 1;

    const range =
      endUnit > unit
        ? `${config.unit_label} ${unit}-${endUnit}`
        : `${config.unit_label} ${unit}`;

    tasks.push({
      date: available[i],
      subject_id: item.subject_id,
      content: range,
      source_template_task_id: item.id,
    });

    unit = endUnit + 1;
  }

  return tasks;
}

/**
 * conditional: 배정 기간 매일 "트리거 확인용" task만 생성.
 * 액션 task는 트리거가 done 처리되는 순간에만 생성된다 (planReactiveTasks).
 */
function generateConditionalTriggers(
  item: TemplateItem,
  dates: string[],
): GeneratedTask[] {
  const config = item.config as unknown as ConditionalConfig;
  return dates.map((date) => ({
    date,
    subject_id: item.subject_id,
    content: config.trigger,
    source_template_task_id: item.id,
  }));
}

const DAY_INDEX: Record<DayOfWeek, number> = Object.fromEntries(
  DAY_OF_WEEK.map((d, i) => [d, i]),
) as Record<DayOfWeek, number>;

function generateOneTime(
  item: TemplateItem,
  startDate: string,
  durationWeeks: number,
): GeneratedTask[] {
  const config = item.config as unknown as OneTimeConfig;
  if (config.week_number > durationWeeks) return [];
  // startDate는 월요일 — 주차/요일로 날짜 계산
  const offset =
    (config.week_number - 1) * 7 + DAY_INDEX[config.day_of_week];
  return [
    {
      date: addDays(startDate, offset),
      subject_id: item.subject_id,
      content: config.content,
      source_template_task_id: item.id,
    },
  ];
}

// ---------- 진입점 ----------

export interface GenerateInput {
  studentId: string;
  startDate: string; // 반드시 월요일
  durationWeeks: number;
  items: TemplateItem[];
  exceptions: ExceptionPeriod[];
}

export function generatePlanTasks(input: GenerateInput): GeneratedTask[] {
  const { studentId, startDate, durationWeeks, items, exceptions } = input;
  const dates = periodDates(startDate, durationWeeks);

  return items.flatMap((item) => {
    switch (item.item_type) {
      case "daily_routine":
        return generateDailyRoutine(item, dates, studentId, exceptions);
      case "sequential":
        return generateSequential(item, dates, studentId, exceptions);
      case "conditional":
        // 예외 기간 스킵은 daily_routine·sequential에만 적용 (CLAUDE.md)
        return generateConditionalTriggers(item, dates);
      case "one_time":
        return generateOneTime(item, startDate, durationWeeks);
      default:
        return [];
    }
  });
}

// ---------- done 체크 시 반응형 생성 ----------

export interface ReactiveTask {
  date: string;
  subject_id: string;
  content: string;
  source_template_task_id: string;
  related_task_id: string; // 원본(학습/트리거) task
}

/**
 * task가 done으로 바뀔 때 생성할 후속 task 계산.
 *  - sequential 학습 과제 → review_lag_days 뒤 같은 범위 "복습"
 *  - conditional 트리거 → 같은 날짜 액션 과제
 * 두 경우 모두 날짜가 예외 기간과 겹치면 다음 가용일로 미룬다.
 * (복습의 복습은 만들지 않는다 — 원본이 이미 related_task_id를 가진 경우 스킵)
 */
export function planReactiveTask(params: {
  task: {
    id: string;
    student_id: string;
    date: string;
    subject_id: string;
    content: string;
    related_task_id: string | null;
  };
  item: TemplateItem;
  exceptions: ExceptionPeriod[];
}): ReactiveTask | null {
  const { task, item, exceptions } = params;

  // 이미 다른 task에서 파생된 과제(복습/액션)는 다시 파생시키지 않는다
  if (task.related_task_id) return null;

  if (item.item_type === "sequential") {
    const config = item.config as unknown as SequentialConfig;
    const date = nextAvailableDate(
      addDays(task.date, config.review_lag_days),
      task.student_id,
      exceptions,
    );
    return {
      date,
      subject_id: task.subject_id,
      content: `${task.content} 복습`,
      source_template_task_id: item.id,
      related_task_id: task.id,
    };
  }

  if (item.item_type === "conditional") {
    const config = item.config as unknown as ConditionalConfig;
    const date = nextAvailableDate(task.date, task.student_id, exceptions);
    return {
      date,
      subject_id: task.subject_id,
      content: config.action,
      source_template_task_id: item.id,
      related_task_id: task.id,
    };
  }

  return null;
}
