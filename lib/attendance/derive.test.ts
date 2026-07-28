import { describe, expect, it } from "vitest";
import {
  buildMonthlyRow,
  deriveDailyAttendance,
  summarize,
  type AttendanceStatus,
} from "./derive";

describe("deriveDailyAttendance", () => {
  it("완료만 있으면 출석", () => {
    expect(deriveDailyAttendance([{ status: "completed" }])).toBe("present");
  });

  it("대체수업도 출석으로 센다", () => {
    expect(deriveDailyAttendance([{ status: "makeup" }])).toBe("present");
  });

  it("노쇼만 있으면 결석", () => {
    expect(deriveDailyAttendance([{ status: "no_show" }])).toBe("absent");
  });

  it("완료와 노쇼가 섞이면 부분출석", () => {
    expect(
      deriveDailyAttendance([{ status: "completed" }, { status: "no_show" }]),
    ).toBe("partial");
  });

  it("취소만 있으면 판정 대상이 없어 none", () => {
    expect(deriveDailyAttendance([{ status: "canceled" }])).toBe("none");
  });

  it("예정만 있으면 아직 판정하지 않는다", () => {
    expect(deriveDailyAttendance([{ status: "scheduled" }])).toBe("none");
  });

  it("세션이 없으면 none", () => {
    expect(deriveDailyAttendance([])).toBe("none");
  });

  it("취소가 섞여 있어도 판정에 영향을 주지 않는다", () => {
    expect(
      deriveDailyAttendance([{ status: "canceled" }, { status: "completed" }]),
    ).toBe("present");
  });
});

describe("buildMonthlyRow", () => {
  const dates = ["2026-08-03", "2026-08-04", "2026-08-05"];

  it("세션이 있는 날은 파생값을 쓰고 manual=false", () => {
    const row = buildMonthlyRow(
      dates,
      new Map([["2026-08-03", [{ status: "completed" }]]]),
      new Map(),
    );
    expect(row[0]).toEqual({
      date: "2026-08-03",
      status: "present",
      manual: false,
      sessionCount: 1,
    });
  });

  it("세션이 없는 날은 override를 쓰고 manual=true", () => {
    const row = buildMonthlyRow(
      dates,
      new Map(),
      new Map<string, AttendanceStatus>([["2026-08-04", "absent"]]),
    );
    expect(row[1]).toEqual({
      date: "2026-08-04",
      status: "absent",
      manual: true,
      sessionCount: 0,
    });
  });

  it("세션이 있으면 override가 있어도 파생값이 이긴다", () => {
    const row = buildMonthlyRow(
      dates,
      new Map([["2026-08-03", [{ status: "no_show" }]]]),
      new Map<string, AttendanceStatus>([["2026-08-03", "present"]]),
    );
    expect(row[0].status).toBe("absent");
    expect(row[0].manual).toBe(false);
  });

  it("세션도 override도 없으면 none", () => {
    const row = buildMonthlyRow(dates, new Map(), new Map());
    expect(row.every((c) => c.status === "none")).toBe(true);
  });
});

describe("summarize", () => {
  it("상태별 일수를 센다", () => {
    const cells = buildMonthlyRow(
      ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"],
      new Map([
        ["2026-08-03", [{ status: "completed" }]],
        ["2026-08-04", [{ status: "no_show" }]],
        ["2026-08-05", [{ status: "completed" }, { status: "no_show" }]],
      ]),
      new Map(),
    );
    expect(summarize(cells)).toEqual({
      present: 1,
      partial: 1,
      absent: 1,
      none: 1,
    });
  });
});
