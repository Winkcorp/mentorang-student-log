import { hhmm, timeOverlaps, weekdayLabel } from "@/lib/dates";

/**
 * 세션 충돌 감지 — CLAUDE.md "충돌 감지 규칙".
 *
 * 순수 함수만 둔다(DB 접근 없음) — 저장 전 미리보기와 드래그 이동 검사가
 * 같은 로직을 써야 하고, 테스트가 가능해야 하므로.
 *
 * 3종 검사:
 *   1. 멘토 — 같은 시간에 1건이라도 겹치면 충돌
 *   2. 학생 — 같은 시간에 1건이라도 겹치면 충돌
 *   3. 공간 — rooms.capacity가 null이면 1건만(단독 사용),
 *             값이 있으면 정원을 초과할 때만 충돌.
 *             room_blocks와 겹치면 정원과 무관하게 충돌.
 *
 * 검사 대상에서 제외: deleted_at이 있는 세션, status='canceled' 세션.
 */

export type ConflictKind = "room" | "room_block" | "mentor" | "student";

export interface TimeWindow {
  date: string;
  start_time: string;
  end_time: string;
}

export interface ExistingSession extends TimeWindow {
  id: string;
  mentor_id: string;
  student_id: string;
  room_id: string | null;
  status: string;
  deleted_at?: string | null;
}

export interface RoomBlockWindow extends TimeWindow {
  room_id: string;
  reason?: string | null;
}

/** 저장/이동하려는 세션. 기존 세션을 옮기는 경우 id를 넣으면 자기 자신은 제외된다. */
export interface CandidateSession extends TimeWindow {
  id?: string | null;
  weekNumber?: number | null;
  mentor_id: string;
  student_id: string;
  room_id: string | null;
}

export interface Conflict {
  kind: ConflictKind;
  candidateId?: string | null;
  weekNumber: number | null;
  date: string;
  startTime: string;
  /** "3주차 화요일 16:30 — 공습룸이 이미 예약됨" */
  message: string;
}

export interface ConflictContext {
  existing: ExistingSession[];
  roomBlocks?: RoomBlockWindow[];
  rooms?: { id: string; name: string; capacity: number | null }[];
  /** 메시지에 쓸 이름 (없으면 "멘토"/"학생"으로 표기) */
  mentorNames?: Record<string, string>;
  studentNames?: Record<string, string>;
}

/** 충돌 검사에서 살아있는 세션만 남긴다. */
function isLive(s: ExistingSession): boolean {
  return !s.deleted_at && s.status !== "canceled";
}

function when(c: CandidateSession): string {
  const time = hhmm(c.start_time);
  return c.weekNumber
    ? `${c.weekNumber}주차 ${weekdayLabel(c.date)}요일 ${time}`
    : `${c.date}(${weekdayLabel(c.date)}) ${time}`;
}

function overlapsWindow(a: TimeWindow, b: TimeWindow): boolean {
  return (
    a.date === b.date &&
    timeOverlaps(a.start_time, a.end_time, b.start_time, b.end_time)
  );
}

/**
 * 후보 세션들의 충돌 목록. 빈 배열이면 저장해도 안전하다.
 *
 * 후보끼리의 충돌도 잡는다(한 번에 여러 건을 만들 때 자기들끼리 겹치는 경우).
 * 중복 보고를 피하려고 후보 i는 자기보다 앞선 후보 j(j<i)하고만 비교한다.
 */
export function detectConflicts(
  candidates: CandidateSession[],
  ctx: ConflictContext,
): Conflict[] {
  const conflicts: Conflict[] = [];

  const candidateIds = new Set(
    candidates.map((c) => c.id).filter((id): id is string => !!id),
  );

  // 자기 자신(이동 중인 세션)은 기존 목록에서 뺀다.
  const existing = ctx.existing.filter(
    (s) => isLive(s) && !candidateIds.has(s.id),
  );

  const roomById = new Map(
    (ctx.rooms ?? []).map((r) => [r.id, r] as const),
  );

  const push = (
    c: CandidateSession,
    kind: ConflictKind,
    detail: string,
  ): void => {
    conflicts.push({
      kind,
      candidateId: c.id ?? null,
      weekNumber: c.weekNumber ?? null,
      date: c.date,
      startTime: hhmm(c.start_time),
      message: `${when(c)} — ${detail}`,
    });
  };

  candidates.forEach((c, i) => {
    const earlier = candidates.slice(0, i);

    // ---- 1. 멘토 충돌 -------------------------------------------------
    const mentorBusy =
      existing.some((s) => s.mentor_id === c.mentor_id && overlapsWindow(s, c)) ||
      earlier.some((o) => o.mentor_id === c.mentor_id && overlapsWindow(o, c));

    if (mentorBusy) {
      const name = ctx.mentorNames?.[c.mentor_id] ?? "해당 멘토";
      push(c, "mentor", `${name}가 이미 다른 세션 중`);
    }

    // ---- 2. 학생 충돌 -------------------------------------------------
    const studentBusy =
      existing.some(
        (s) => s.student_id === c.student_id && overlapsWindow(s, c),
      ) ||
      earlier.some((o) => o.student_id === c.student_id && overlapsWindow(o, c));

    if (studentBusy) {
      const name = ctx.studentNames?.[c.student_id] ?? "해당 학생";
      push(c, "student", `${name}가 이미 다른 세션 중`);
    }

    // ---- 3. 공간 충돌 -------------------------------------------------
    if (!c.room_id) return;

    const room = roomById.get(c.room_id);
    const roomName = room?.name ?? "공간";

    // 3-a. 사용 불가 구간 — 정원과 무관하게 차단
    const block = (ctx.roomBlocks ?? []).find(
      (b) => b.room_id === c.room_id && overlapsWindow(b, c),
    );
    if (block) {
      const reason = block.reason ? ` (${block.reason})` : "";
      push(c, "room_block", `${roomName} 사용 불가${reason}`);
      return;
    }

    // 3-b. 정원 — null이면 단독 사용(1건)
    const capacity = room?.capacity ?? 1;

    const occupied =
      existing.filter((s) => s.room_id === c.room_id && overlapsWindow(s, c))
        .length +
      earlier.filter((o) => o.room_id === c.room_id && overlapsWindow(o, c))
        .length;

    if (occupied + 1 > capacity) {
      const detail =
        capacity === 1
          ? `${roomName}이 이미 예약됨`
          : `${roomName} 정원 초과 (정원 ${capacity}명, 이미 ${occupied}명)`;
      push(c, "room", detail);
    }
  });

  return conflicts;
}
