import { describe, expect, it } from "vitest";
import {
  calculateSettlement,
  type SettlementSession,
} from "./calculate";

const session = (
  id: string,
  status: SettlementSession["status"],
  start = "19:00",
  end = "21:00",
  related: string | null = null,
): SettlementSession => ({
  id,
  date: "2026-07-20",
  start_time: start,
  end_time: end,
  status,
  related_session_id: related,
});

describe("calculateSettlement", () => {
  it("hourly: 진행시간 × 단가, 분 단위 반올림 (100분 → 1.67h)", () => {
    const r = calculateSettlement({
      rateType: "hourly",
      rateAmount: 30000,
      sessions: [session("s1", "completed", "19:00", "20:40")], // 100분
    });
    expect(r.totalHours).toBe(1.67);
    expect(r.amount).toBe(50100); // 1.67 × 30000
  });

  it("per_session: 집계 세션 수 × 단가", () => {
    const r = calculateSettlement({
      rateType: "per_session",
      rateAmount: 50000,
      sessions: [
        session("s1", "completed"),
        session("s2", "completed"),
        session("s3", "canceled"),
      ],
    });
    expect(r.totalSessions).toBe(2);
    expect(r.amount).toBe(100000);
  });

  it("flat: 세션 수와 무관 고정액 (단 0세션이면 0원)", () => {
    const many = calculateSettlement({
      rateType: "flat",
      rateAmount: 1000000,
      sessions: [session("s1", "completed"), session("s2", "completed")],
    });
    expect(many.amount).toBe(1000000);

    const none = calculateSettlement({
      rateType: "flat",
      rateAmount: 1000000,
      sessions: [session("s1", "canceled")],
    });
    expect(none.amount).toBe(0);
  });

  it("no_show(학생 귀책)는 포함 (TBD 기본값)", () => {
    const r = calculateSettlement({
      rateType: "hourly",
      rateAmount: 30000,
      sessions: [session("s1", "no_show", "19:00", "21:00")],
    });
    expect(r.totalSessions).toBe(1);
    expect(r.totalHours).toBe(2);
    expect(r.amount).toBe(60000);
  });

  it("canceled는 제외", () => {
    const r = calculateSettlement({
      rateType: "hourly",
      rateAmount: 30000,
      sessions: [session("s1", "canceled")],
    });
    expect(r.totalSessions).toBe(0);
    expect(r.amount).toBe(0);
  });

  it("makeup은 포함, 원 세션은 상태와 무관하게 제외 (이중 정산 금지)", () => {
    // 원 세션이 canceled인 정상 케이스
    const normal = calculateSettlement({
      rateType: "per_session",
      rateAmount: 50000,
      sessions: [
        session("orig", "canceled"),
        session("mk", "makeup", "19:00", "21:00", "orig"),
      ],
    });
    expect(normal.totalSessions).toBe(1);
    expect(normal.countedSessionIds).toEqual(["mk"]);

    // 원 세션이 실수로 completed로 남아 있어도 이중 정산되지 않음
    const guarded = calculateSettlement({
      rateType: "per_session",
      rateAmount: 50000,
      sessions: [
        session("orig", "completed"),
        session("mk", "makeup", "19:00", "21:00", "orig"),
      ],
    });
    expect(guarded.totalSessions).toBe(1);
    expect(guarded.countedSessionIds).toEqual(["mk"]);
    expect(guarded.replacedSessionIds).toEqual(["orig"]);
  });

  it("같은 입력이면 같은 결과 (재실행 결정성)", () => {
    const input = {
      rateType: "hourly" as const,
      rateAmount: 25000,
      sessions: [
        session("s1", "completed"),
        session("s2", "no_show", "21:00", "22:30"),
        session("s3", "canceled"),
        session("s4", "makeup", "19:00", "20:30", "s3"),
      ],
    };
    const a = calculateSettlement(input);
    const b = calculateSettlement(input);
    expect(a).toEqual(b);
    // 2h + 1.5h + 1.5h = 5h
    expect(a.totalHours).toBe(5);
    expect(a.amount).toBe(125000);
  });
});
