/**
 * template_tasks.item_type별 config(jsonb) 구조 정의 + 검증.
 * DB에도 template_tasks_config_shape CHECK가 있지만(2중 방어),
 * 애플리케이션에서 먼저 명확한 한국어 에러를 돌려준다.
 */

export type ItemType =
  | "daily_routine"
  | "sequential"
  | "conditional"
  | "one_time";

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  daily_routine: "매일 반복",
  sequential: "순차 진행+복습",
  conditional: "조건부",
  one_time: "1회성",
};

export const DAY_OF_WEEK = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayOfWeek = (typeof DAY_OF_WEEK)[number];

export const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
};

export interface DailyRoutineConfig {
  instruction: string;
  days?: string; // 예: "mon-sun" (현재는 매일 생성, 향후 요일 제한용)
}

export interface SequentialConfig {
  unit_label: string; // 예: "Day"
  start_unit: number; // 시작 번호 (예: 25)
  units_per_period: number; // 주기당 전진량 (예: 3 → Day 25-27)
  period_days: number; // 주기(일) (예: 1 = 매일 전진)
  review_lag_days: number; // 완료 후 복습까지 일수
  total_units?: number; // 전체 범위 상한 (넘어가면 생성 중단)
}

export interface ConditionalConfig {
  trigger: string; // 트리거 행동 (예: "수1 인강 1강 시청")
  action: string; // 트리거 완료 시 생성될 액션 (예: "마플 문제 풀이")
}

export interface OneTimeConfig {
  week_number: number; // 1부터
  day_of_week: DayOfWeek;
  content: string;
}

export type ItemConfig =
  | DailyRoutineConfig
  | SequentialConfig
  | ConditionalConfig
  | OneTimeConfig;

interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isPositiveInt(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * item_type과 config의 정합성 검증.
 * item_type에 안 맞는 config(예: daily_routine인데 sequential용 필드만 있음)는 거부.
 */
export function validateConfig(
  itemType: ItemType,
  config: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  switch (itemType) {
    case "daily_routine": {
      if (!isNonEmptyString(config.instruction))
        errors.push("instruction(반복할 내용)을 입력하세요.");
      break;
    }
    case "sequential": {
      if (!isNonEmptyString(config.unit_label))
        errors.push("unit_label(단위 이름, 예: Day)을 입력하세요.");
      if (!isPositiveInt(config.start_unit))
        errors.push("start_unit(시작 번호)은 1 이상의 정수여야 합니다.");
      if (!isPositiveInt(config.units_per_period))
        errors.push("units_per_period(주기당 전진량)는 1 이상의 정수여야 합니다.");
      if (!isPositiveInt(config.period_days))
        errors.push("period_days(주기 일수)는 1 이상의 정수여야 합니다.");
      if (!isPositiveInt(config.review_lag_days))
        errors.push("review_lag_days(복습 텀)는 1 이상의 정수여야 합니다.");
      if (
        config.total_units !== undefined &&
        config.total_units !== null &&
        !isPositiveInt(config.total_units)
      )
        errors.push("total_units(전체 범위)는 1 이상의 정수여야 합니다.");
      break;
    }
    case "conditional": {
      if (!isNonEmptyString(config.trigger))
        errors.push("trigger(트리거 행동)를 입력하세요.");
      if (!isNonEmptyString(config.action))
        errors.push("action(생성될 과제)을 입력하세요.");
      break;
    }
    case "one_time": {
      if (!isPositiveInt(config.week_number))
        errors.push("week_number(주차)는 1 이상의 정수여야 합니다.");
      if (!DAY_OF_WEEK.includes(config.day_of_week as DayOfWeek))
        errors.push("day_of_week(요일)가 올바르지 않습니다.");
      if (!isNonEmptyString(config.content))
        errors.push("content(내용)를 입력하세요.");
      break;
    }
    default:
      errors.push(`알 수 없는 item_type: ${itemType}`);
  }

  return { ok: errors.length === 0, errors };
}
