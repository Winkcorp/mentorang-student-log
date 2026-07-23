import { describe, expect, it } from "vitest";
import { validateConfig } from "./config";

describe("validateConfig — item_type과 config 정합성", () => {
  it("daily_routine: instruction이 있으면 통과", () => {
    expect(
      validateConfig("daily_routine", { instruction: "강기본 하루 2강씩" }).ok,
    ).toBe(true);
  });

  it("daily_routine인데 sequential용 필드만 있으면 거부", () => {
    const r = validateConfig("daily_routine", {
      unit_label: "Day",
      start_unit: 25,
      units_per_period: 3,
      period_days: 1,
      review_lag_days: 3,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join("")).toContain("instruction");
  });

  it("sequential: 필수 숫자 필드 전부 있어야 통과", () => {
    expect(
      validateConfig("sequential", {
        unit_label: "Day",
        start_unit: 25,
        units_per_period: 3,
        period_days: 1,
        review_lag_days: 3,
        total_units: 60,
      }).ok,
    ).toBe(true);
  });

  it("sequential: 음수/0/소수는 거부", () => {
    expect(
      validateConfig("sequential", {
        unit_label: "Day",
        start_unit: 0,
        units_per_period: -1,
        period_days: 1.5,
        review_lag_days: 3,
      }).ok,
    ).toBe(false);
  });

  it("conditional: trigger/action 둘 다 필요", () => {
    expect(
      validateConfig("conditional", { trigger: "인강 시청", action: "문제 풀이" })
        .ok,
    ).toBe(true);
    expect(validateConfig("conditional", { trigger: "인강 시청" }).ok).toBe(
      false,
    );
  });

  it("one_time: 잘못된 요일 거부", () => {
    expect(
      validateConfig("one_time", {
        week_number: 1,
        day_of_week: "funday",
        content: "모의고사",
      }).ok,
    ).toBe(false);
  });

  it("one_time: 정상 케이스 통과", () => {
    expect(
      validateConfig("one_time", {
        week_number: 2,
        day_of_week: "sat",
        content: "모의고사 기출 1회분",
      }).ok,
    ).toBe(true);
  });
});
