import { describe, expect, it } from "vitest";
import { parseOneTimeTable } from "./parseOneTime";

describe("parseOneTimeTable — GPT 학습플랜 표 파싱", () => {
  it("파이프 구분 형식 파싱", () => {
    const { rows, errors } = parseOneTimeTable(
      "1주 | 토 | 국어 | 모의고사 기출 1회분\n2주 | 일 | 수학 | 마플 4단원 테스트",
    );
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      week_number: 1,
      day_of_week: "sat",
      subject: "국어",
      content: "모의고사 기출 1회분",
    });
    expect(rows[1].day_of_week).toBe("sun");
  });

  it("탭(TSV) 구분 형식 파싱 + 영문 요일", () => {
    const { rows, errors } = parseOneTimeTable("3\tmon\t영어\t단어시험 Day1-30");
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ week_number: 3, day_of_week: "mon" });
  });

  it("헤더 행은 조용히 스킵", () => {
    const { rows, errors } = parseOneTimeTable(
      "주차 | 요일 | 과목 | 내용\n1주 | 월 | 국어 | 비문학 2지문",
    );
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it("형식이 안 맞는 행은 행 번호와 이유를 보고 (조용히 무시 금지)", () => {
    const { rows, errors } = parseOneTimeTable(
      "1주 | 토 | 국어 | 모의고사\n이상한 줄\n3주 | 없는요일 | 수학 | 테스트",
    );
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(2);
    expect(errors[0].reason).toContain("열이");
    expect(errors[1].line).toBe(3);
    expect(errors[1].reason).toContain("요일");
  });

  it("빈 줄은 에러가 아님", () => {
    const { rows, errors } = parseOneTimeTable(
      "\n1주 | 토 | 국어 | 모의고사\n\n",
    );
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it("주차/요일 다양한 표기 허용 (1주차, 월요일, monday)", () => {
    const { rows, errors } = parseOneTimeTable(
      "1주차 | 월요일 | 국어 | A\nweek 2 | monday | 영어 | B",
    );
    expect(errors).toHaveLength(0);
    expect(rows[0].day_of_week).toBe("mon");
    expect(rows[1]).toMatchObject({ week_number: 2, day_of_week: "mon" });
  });
});
