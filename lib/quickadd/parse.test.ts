import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddContext } from "./parse";

const ctx: QuickAddContext = {
  date: "2026-08-05",
  students: [
    { id: "s1", name: "김학생" },
    { id: "s2", name: "이학생" },
  ],
  mentors: [{ id: "m1", name: "박멘토" }],
};

describe("parseQuickAdd — 자연어 빠른 입력", () => {
  it("학생+과목+내용 → 과제 제안", () => {
    const s = parseQuickAdd("김학생 국어 강기본 2강", ctx);
    expect(s[0]).toMatchObject({
      kind: "task",
      studentId: "s1",
      subject: "국어",
      content: "강기본 2강",
    });
  });

  it("시간 범위(HH:MM) 포함 → 세션 제안 우선", () => {
    const s = parseQuickAdd("이학생 19:00-21:00 세션", ctx);
    expect(s[0]).toMatchObject({
      kind: "session",
      studentId: "s2",
      startTime: "19:00",
      endTime: "21:00",
    });
  });

  it("N시~N시 표기 + 오후 해석 (7시-9시 → 19:00~21:00)", () => {
    const s = parseQuickAdd("김학생 세션 7시-9시", ctx);
    expect(s[0]).toMatchObject({
      kind: "session",
      startTime: "19:00",
      endTime: "21:00",
    });
  });

  it("멘토 이름 포함 세션 → 멘토 연결", () => {
    const s = parseQuickAdd("김학생 박멘토 수업 19:00-20:30", ctx);
    expect(s[0]).toMatchObject({
      kind: "session",
      mentorId: "m1",
      mentorName: "박멘토",
    });
  });

  it("여행/예외 키워드 → 예외일정 제안 (기간 파싱)", () => {
    const s = parseQuickAdd("김학생 가족여행 ~8/7", ctx);
    expect(s[0]).toMatchObject({
      kind: "exception",
      studentId: "s1",
      endDate: "2026-08-07",
    });
  });

  it("세션 키워드 없이 시간만 있어도 세션 제안", () => {
    const s = parseQuickAdd("이학생 20:00-22:00", ctx);
    expect(s[0].kind).toBe("session");
  });

  it("학생 이름 없으면 힌트", () => {
    const s = parseQuickAdd("국어 강기본 2강", ctx);
    expect(s[0].kind).toBe("hint");
  });

  it("학생 필터가 1명일 땐 이름 생략 가능 (defaultStudentId)", () => {
    const s = parseQuickAdd("영어 단어 Day 30", {
      ...ctx,
      defaultStudentId: "s2",
    });
    expect(s[0]).toMatchObject({
      kind: "task",
      studentId: "s2",
      subject: "영어",
    });
  });

  it("allowException=false면 예외일정 제안 안 함 (mentor 역할)", () => {
    const s = parseQuickAdd("김학생 가족여행", { ...ctx, allowException: false });
    expect(s.every((x) => x.kind !== "exception")).toBe(true);
  });

  it("세션+과제 신호가 섞이면 둘 다 제안 (세션 우선)", () => {
    const s = parseQuickAdd("김학생 수학 마플 풀이 19:00-21:00", ctx);
    expect(s[0].kind).toBe("session");
    expect(s.some((x) => x.kind === "task")).toBe(true);
  });
});
