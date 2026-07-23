import { describe, expect, it } from "vitest";
import {
  addDays,
  generatePlanTasks,
  isExcludedDate,
  isMonday,
  nextAvailableDate,
  planReactiveTask,
  type ExceptionPeriod,
  type TemplateItem,
} from "./generate";

const STUDENT = "student-1";
const MONDAY = "2026-08-03"; // 월요일

const exception = (
  start: string,
  end: string,
  studentId: string | null = STUDENT,
): ExceptionPeriod => ({
  student_id: studentId,
  start_date: start,
  end_date: end,
  suppress_generation: true,
});

describe("날짜 유틸", () => {
  it("addDays / isMonday", () => {
    expect(addDays("2026-08-03", 7)).toBe("2026-08-10");
    expect(isMonday("2026-08-03")).toBe(true);
    expect(isMonday("2026-08-04")).toBe(false);
  });

  it("isExcludedDate — 본인/전체 예외만 적용", () => {
    const ex = [exception("2026-08-05", "2026-08-07")];
    expect(isExcludedDate("2026-08-05", STUDENT, ex)).toBe(true);
    expect(isExcludedDate("2026-08-05", "other-student", ex)).toBe(false);
    expect(
      isExcludedDate("2026-08-05", "other-student", [
        exception("2026-08-05", "2026-08-07", null), // 전체 예외
      ]),
    ).toBe(true);
  });

  it("nextAvailableDate — 예외 기간 다음 날로", () => {
    const ex = [exception("2026-08-05", "2026-08-07")];
    expect(nextAvailableDate("2026-08-05", STUDENT, ex)).toBe("2026-08-08");
    expect(nextAvailableDate("2026-08-04", STUDENT, ex)).toBe("2026-08-04");
  });
});

describe("daily_routine 생성", () => {
  const item: TemplateItem = {
    id: "tt-daily",
    subject: "국어",
    item_type: "daily_routine",
    config: { instruction: "강기본 하루 2강씩" },
  };

  it("기간 내 매일 생성, 예외 기간 제외", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 1,
      items: [item],
      exceptions: [exception("2026-08-05", "2026-08-06")],
    });
    expect(tasks).toHaveLength(5); // 7일 - 예외 2일
    expect(tasks.map((t) => t.date)).not.toContain("2026-08-05");
    expect(tasks.map((t) => t.date)).not.toContain("2026-08-06");
    expect(tasks[0].content).toBe("강기본 하루 2강씩");
  });
});

describe("sequential 생성", () => {
  const item: TemplateItem = {
    id: "tt-seq",
    subject: "영어",
    item_type: "sequential",
    config: {
      unit_label: "Day",
      start_unit: 25,
      units_per_period: 3,
      period_days: 1,
      review_lag_days: 3,
      total_units: 33,
    },
  };

  it("범위가 주기마다 전진, total_units에서 중단", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 1,
      items: [item],
      exceptions: [],
    });
    // 25-27, 28-30, 31-33 → total_units=33에서 중단
    expect(tasks).toHaveLength(3);
    expect(tasks[0].content).toBe("Day 25-27");
    expect(tasks[1].content).toBe("Day 28-30");
    expect(tasks[2].content).toBe("Day 31-33");
  });

  it("예외 기간에는 일시정지 — 범위 유실 없이 이후 이어짐", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 1,
      items: [item],
      exceptions: [exception("2026-08-04", "2026-08-05")], // 화·수 제외
    });
    expect(tasks.map((t) => t.date)).toEqual([
      "2026-08-03", // 월
      "2026-08-06", // 목 (화수 건너뜀)
      "2026-08-07", // 금
    ]);
    // 범위는 순서대로 유지
    expect(tasks.map((t) => t.content)).toEqual([
      "Day 25-27",
      "Day 28-30",
      "Day 31-33",
    ]);
  });

  it("period_days > 1이면 가용일 기준으로 주기 적용", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 1,
      items: [
        {
          ...item,
          config: { ...item.config, period_days: 2, total_units: undefined },
        },
      ],
      exceptions: [],
    });
    expect(tasks.map((t) => t.date)).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-07",
      "2026-08-09",
    ]);
  });
});

describe("conditional 생성", () => {
  const item: TemplateItem = {
    id: "tt-cond",
    subject: "수학",
    item_type: "conditional",
    config: { trigger: "수1 인강 1강 시청", action: "마플 문제 풀이" },
  };

  it("트리거 확인용 task만 매일 생성 — 액션 task는 없음", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 1,
      items: [item],
      exceptions: [],
    });
    expect(tasks).toHaveLength(7);
    expect(tasks.every((t) => t.content === "수1 인강 1강 시청")).toBe(true);
    expect(tasks.some((t) => t.content.includes("마플"))).toBe(false);
  });
});

describe("one_time 생성", () => {
  it("주차/요일 기준 단일 생성", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 4,
      items: [
        {
          id: "tt-once",
          subject: "국어",
          item_type: "one_time",
          config: { week_number: 2, day_of_week: "sat", content: "모의고사" },
        },
      ],
      exceptions: [],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].date).toBe("2026-08-15"); // 2주차 토요일
  });

  it("템플릿 기간을 넘는 주차는 생성 안 함", () => {
    const tasks = generatePlanTasks({
      studentId: STUDENT,
      startDate: MONDAY,
      durationWeeks: 1,
      items: [
        {
          id: "tt-once2",
          subject: "국어",
          item_type: "one_time",
          config: { week_number: 3, day_of_week: "sat", content: "모의고사" },
        },
      ],
      exceptions: [],
    });
    expect(tasks).toHaveLength(0);
  });
});

describe("planReactiveTask — done 체크 시 후속 과제", () => {
  const seqItem: TemplateItem = {
    id: "tt-seq",
    subject: "영어",
    item_type: "sequential",
    config: {
      unit_label: "Day",
      start_unit: 25,
      units_per_period: 3,
      period_days: 1,
      review_lag_days: 3,
    },
  };
  const condItem: TemplateItem = {
    id: "tt-cond",
    subject: "수학",
    item_type: "conditional",
    config: { trigger: "인강 시청", action: "마플 문제 풀이" },
  };

  const baseTask = {
    id: "task-1",
    student_id: STUDENT,
    date: "2026-08-03",
    subject: "영어",
    content: "Day 25-27",
    related_task_id: null,
  };

  it("sequential 완료 → review_lag_days 뒤 복습 과제", () => {
    const r = planReactiveTask({ task: baseTask, item: seqItem, exceptions: [] });
    expect(r).not.toBeNull();
    expect(r!.date).toBe("2026-08-06"); // +3일
    expect(r!.content).toBe("Day 25-27 복습");
    expect(r!.related_task_id).toBe("task-1");
  });

  it("복습 날짜가 예외 기간과 겹치면 다음 가용일로", () => {
    const r = planReactiveTask({
      task: baseTask,
      item: seqItem,
      exceptions: [exception("2026-08-06", "2026-08-08")],
    });
    expect(r!.date).toBe("2026-08-09");
  });

  it("conditional 트리거 완료 → 같은 날짜 액션 과제", () => {
    const r = planReactiveTask({
      task: { ...baseTask, subject: "수학", content: "인강 시청" },
      item: condItem,
      exceptions: [],
    });
    expect(r!.date).toBe("2026-08-03");
    expect(r!.content).toBe("마플 문제 풀이");
  });

  it("액션 날짜가 예외 기간과 겹치면 다음 가용일로", () => {
    const r = planReactiveTask({
      task: { ...baseTask, subject: "수학", content: "인강 시청" },
      item: condItem,
      exceptions: [exception("2026-08-03", "2026-08-04")],
    });
    expect(r!.date).toBe("2026-08-05");
  });

  it("이미 파생된 과제(복습/액션)는 다시 파생시키지 않음", () => {
    const r = planReactiveTask({
      task: { ...baseTask, related_task_id: "origin-task" },
      item: seqItem,
      exceptions: [],
    });
    expect(r).toBeNull();
  });
});
