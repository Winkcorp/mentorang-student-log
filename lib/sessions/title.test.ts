import { describe, expect, it } from "vitest";
import { isoDow, seriesDates, weekdayLabel } from "@/lib/dates";
import { progressLabel, sessionTitle, suggestNextProgressFrom } from "./title";

describe("sessionTitle", () => {
  it("전체 필드가 있으면 CLAUDE.md 형식대로 조립", () => {
    expect(
      sessionTitle({
        sessionTypeCode: "공부습관GPT",
        date: "2026-08-04", // 화
        timeSlotLabel: "A",
        weekNumber: 1,
        totalWeeks: 4,
        mentorName: "임태호",
        studentName: "주보경",
      }),
    ).toBe("공부습관GPT_화A_1주/4주_임태호M_주보경");
  });

  it("시간대 라벨이 없으면 요일만", () => {
    expect(
      sessionTitle({
        sessionTypeCode: "공습",
        date: "2026-08-04",
        weekNumber: 2,
        totalWeeks: 4,
        mentorName: "박멘토",
        studentName: "김학생",
      }),
    ).toBe("공습_화_2주/4주_박멘토M_김학생");
  });

  it("시리즈 소속이 아니면 주차 구간이 빠진다", () => {
    expect(
      sessionTitle({
        sessionTypeCode: "국어PT",
        date: "2026-08-04",
        timeSlotLabel: "B",
        mentorName: "박멘토",
        studentName: "김학생",
      }),
    ).toBe("국어PT_화B_박멘토M_김학생");
  });

  it("빈 구간 때문에 '_'가 남지 않는다", () => {
    expect(sessionTitle({ studentName: "김학생" })).toBe("김학생");
    expect(sessionTitle({})).toBe("");
  });

  it("총 주차를 모르면 현재 주차만", () => {
    expect(
      sessionTitle({ sessionTypeCode: "공습", weekNumber: 3, studentName: "김학생" }),
    ).toBe("공습_3주_김학생");
  });
});

describe("progressLabel", () => {
  it("범위와 총량이 있으면 '3~6강/40강'", () => {
    expect(progressLabel({ from: 3, to: 6, total: 40, unitLabel: "강" })).toBe(
      "3~6강/40강",
    );
  });

  it("아직 종료 진도를 입력하지 않았으면 '?'", () => {
    expect(progressLabel({ from: 3, to: null, total: 40, unitLabel: "강" })).toBe(
      "3~?강/40강",
    );
  });

  it("총량을 모르면 범위만", () => {
    expect(progressLabel({ from: 1, to: 3, unitLabel: "단원" })).toBe("1~3단원");
  });

  it("진도가 아예 없으면 null", () => {
    expect(progressLabel({ from: null, to: null, total: 40 })).toBeNull();
  });
});

describe("suggestNextProgressFrom", () => {
  it("직전 회차의 progress_to를 이어받는다", () => {
    expect(suggestNextProgressFrom(3)).toBe(3);
  });

  it("직전 회차가 없거나 미입력이면 null", () => {
    expect(suggestNextProgressFrom(null)).toBeNull();
    expect(suggestNextProgressFrom(undefined)).toBeNull();
  });
});

describe("날짜 유틸", () => {
  it("isoDow는 1=월 … 7=일", () => {
    expect(isoDow("2026-08-03")).toBe(1); // 월
    expect(isoDow("2026-08-04")).toBe(2); // 화
    expect(isoDow("2026-08-09")).toBe(7); // 일
  });

  it("weekdayLabel은 날짜와 요일번호 둘 다 받는다", () => {
    expect(weekdayLabel("2026-08-04")).toBe("화");
    expect(weekdayLabel(2)).toBe("화");
  });

  it("seriesDates는 시작일이 지정 요일이면 그 날부터 7일 간격", () => {
    expect(seriesDates("2026-07-21", 2, 4)).toEqual([
      { weekNumber: 1, date: "2026-07-21" },
      { weekNumber: 2, date: "2026-07-28" },
      { weekNumber: 3, date: "2026-08-04" },
      { weekNumber: 4, date: "2026-08-11" },
    ]);
  });

  it("시작일이 지정 요일이 아니면 이후 첫 해당 요일부터 — 1주를 날리지 않는다", () => {
    // 2026-07-20(월)에서 화요일 시리즈를 시작 → 다음날 7/21부터
    expect(seriesDates("2026-07-20", 2, 2)).toEqual([
      { weekNumber: 1, date: "2026-07-21" },
      { weekNumber: 2, date: "2026-07-28" },
    ]);
  });

  it("시작일보다 앞선 요일이면 다음 주로 넘어간다", () => {
    // 2026-07-22(수)에서 화요일 시리즈 → 다음 주 화요일 7/28
    expect(seriesDates("2026-07-22", 2, 1)).toEqual([
      { weekNumber: 1, date: "2026-07-28" },
    ]);
  });
});
