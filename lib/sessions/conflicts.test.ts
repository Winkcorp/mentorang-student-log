import { describe, expect, it } from "vitest";
import {
  detectConflicts,
  type CandidateSession,
  type ConflictContext,
  type ExistingSession,
} from "./conflicts";

const ROOMS = [
  { id: "room-solo", name: "1:1룸A", capacity: null }, // 단독 사용
  { id: "room-group", name: "공습룸", capacity: 2 },
];

const NAMES: Pick<ConflictContext, "mentorNames" | "studentNames"> = {
  mentorNames: { "m-1": "박멘토", "m-2": "최멘토" },
  studentNames: { "s-1": "김학생", "s-2": "이학생" },
};

function existing(over: Partial<ExistingSession> = {}): ExistingSession {
  return {
    id: "e-1",
    mentor_id: "m-1",
    student_id: "s-1",
    room_id: "room-solo",
    date: "2026-08-04",
    start_time: "19:00",
    end_time: "21:00",
    status: "scheduled",
    deleted_at: null,
    ...over,
  };
}

function candidate(over: Partial<CandidateSession> = {}): CandidateSession {
  return {
    weekNumber: 3,
    mentor_id: "m-2",
    student_id: "s-2",
    room_id: null,
    date: "2026-08-04",
    start_time: "19:00",
    end_time: "21:00",
    ...over,
  };
}

describe("detectConflicts — 멘토/학생", () => {
  it("같은 멘토가 겹치는 시간이면 충돌", () => {
    const r = detectConflicts([candidate({ mentor_id: "m-1" })], {
      existing: [existing()],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r.map((c) => c.kind)).toContain("mentor");
    expect(r[0].message).toContain("박멘토");
  });

  it("같은 학생이 겹치는 시간이면 충돌", () => {
    const r = detectConflicts([candidate({ student_id: "s-1" })], {
      existing: [existing()],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r.map((c) => c.kind)).toContain("student");
  });

  it("시간이 안 겹치면 충돌 없음", () => {
    const r = detectConflicts(
      [candidate({ mentor_id: "m-1", start_time: "21:00", end_time: "22:30" })],
      { existing: [existing()], rooms: ROOMS, ...NAMES },
    );
    expect(r).toEqual([]);
  });

  it("경계가 맞닿는 것(19:00 종료 ↔ 19:00 시작)은 충돌이 아님", () => {
    const r = detectConflicts(
      [candidate({ mentor_id: "m-1", start_time: "17:00", end_time: "19:00" })],
      { existing: [existing()], rooms: ROOMS, ...NAMES },
    );
    expect(r).toEqual([]);
  });

  it("날짜가 다르면 충돌 없음", () => {
    const r = detectConflicts([candidate({ mentor_id: "m-1", date: "2026-08-05" })], {
      existing: [existing()],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r).toEqual([]);
  });
});

describe("detectConflicts — 공간 정원", () => {
  it("capacity가 null인 공간은 1건만 허용", () => {
    const r = detectConflicts([candidate({ room_id: "room-solo" })], {
      existing: [existing({ room_id: "room-solo" })],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r.map((c) => c.kind)).toContain("room");
    expect(r.find((c) => c.kind === "room")!.message).toContain(
      "1:1룸A이 이미 예약됨",
    );
  });

  it("capacity 2인 공간은 1건 있어도 통과", () => {
    const r = detectConflicts([candidate({ room_id: "room-group" })], {
      existing: [existing({ room_id: "room-group", mentor_id: "m-9", student_id: "s-9" })],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r).toEqual([]);
  });

  it("capacity 2인 공간에 이미 2건이면 초과로 충돌", () => {
    const r = detectConflicts([candidate({ room_id: "room-group" })], {
      existing: [
        existing({ id: "e-1", room_id: "room-group", mentor_id: "m-8", student_id: "s-8" }),
        existing({ id: "e-2", room_id: "room-group", mentor_id: "m-9", student_id: "s-9" }),
      ],
      rooms: ROOMS,
      ...NAMES,
    });
    const room = r.find((c) => c.kind === "room");
    expect(room).toBeDefined();
    expect(room!.message).toContain("정원 초과");
  });

  it("room_blocks와 겹치면 정원과 무관하게 충돌", () => {
    const r = detectConflicts([candidate({ room_id: "room-group" })], {
      existing: [],
      roomBlocks: [
        {
          room_id: "room-group",
          date: "2026-08-04",
          start_time: "19:00",
          end_time: "21:00",
          reason: "시설 점검",
        },
      ],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("room_block");
    expect(r[0].message).toContain("시설 점검");
  });
});

describe("detectConflicts — 제외 규칙", () => {
  it("취소된 세션은 충돌 대상이 아님", () => {
    const r = detectConflicts([candidate({ mentor_id: "m-1", room_id: "room-solo" })], {
      existing: [existing({ status: "canceled" })],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r).toEqual([]);
  });

  it("소프트 삭제된 세션은 충돌 대상이 아님", () => {
    const r = detectConflicts([candidate({ mentor_id: "m-1", room_id: "room-solo" })], {
      existing: [existing({ deleted_at: "2026-08-01T00:00:00Z" })],
      rooms: ROOMS,
      ...NAMES,
    });
    expect(r).toEqual([]);
  });

  it("자기 자신을 옮기는 경우 자기와는 충돌하지 않음", () => {
    const r = detectConflicts(
      [candidate({ id: "e-1", mentor_id: "m-1", room_id: "room-solo" })],
      { existing: [existing({ id: "e-1" })], rooms: ROOMS, ...NAMES },
    );
    expect(r).toEqual([]);
  });
});

describe("detectConflicts — 후보끼리", () => {
  it("한 번에 만드는 후보끼리 겹치면 뒤쪽 후보에서 잡힌다", () => {
    const a = candidate({ weekNumber: 1, mentor_id: "m-1", room_id: "room-solo" });
    const b = candidate({ weekNumber: 2, mentor_id: "m-1", room_id: "room-solo" });
    const r = detectConflicts([a, b], { existing: [], rooms: ROOMS, ...NAMES });

    // 앞 후보(1주차)는 통과, 뒤 후보(2주차)에서만 충돌 보고
    expect(r.every((c) => c.weekNumber === 2)).toBe(true);
    // 두 후보는 멘토·학생·공간이 모두 같으므로 3종 전부 잡힌다
    expect(r.map((c) => c.kind).sort()).toEqual(["mentor", "room", "student"]);
  });
});

describe("메시지 형식", () => {
  it("주차가 있으면 'N주차 요일 시각 — 사유'", () => {
    const r = detectConflicts(
      [candidate({ weekNumber: 3, room_id: "room-solo", start_time: "16:30", end_time: "18:00" })],
      {
        existing: [existing({ room_id: "room-solo", start_time: "16:30", end_time: "18:00", mentor_id: "m-9", student_id: "s-9" })],
        rooms: ROOMS,
        ...NAMES,
      },
    );
    expect(r[0].message).toBe("3주차 화요일 16:30 — 1:1룸A이 이미 예약됨");
  });

  it("주차가 없으면 날짜로 표기", () => {
    const r = detectConflicts(
      [candidate({ weekNumber: null, room_id: "room-solo" })],
      {
        existing: [existing({ room_id: "room-solo", mentor_id: "m-9", student_id: "s-9" })],
        rooms: ROOMS,
        ...NAMES,
      },
    );
    expect(r[0].message).toBe("2026-08-04(화) 19:00 — 1:1룸A이 이미 예약됨");
  });
});
