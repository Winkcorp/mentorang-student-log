/**
 * 마스터 테이블 타입 — 클라이언트 컴포넌트도 import하므로
 * 이 파일에는 서버 전용 코드(next/headers, supabase 서버 클라이언트)를
 * 절대 넣지 않는다. 조회는 ./load.ts.
 */

export interface Subject {
  id: string;
  name: string;
  display_order: number;
  color: string;
}

export interface SessionType {
  id: string;
  code: string;
  name: string;
  requires_subject: boolean;
  has_progress: boolean;
  display_order: number;
}

export interface TimeSlot {
  id: string;
  label: string;
  default_start_time: string;
  default_end_time: string;
  display_order: number;
}

export interface Room {
  id: string;
  name: string;
  /** null = 단독 사용(동시 1건). 값이 있으면 그 인원까지 동시 사용 허용. */
  capacity: number | null;
  display_order: number;
}

export interface Masters {
  subjects: Subject[];
  sessionTypes: SessionType[];
  timeSlots: TimeSlot[];
  rooms: Room[];
}

/** id → 항목 맵. 화면에서 라벨·색상을 찾을 때 사용. */
export function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/** 과목 색상 — 마스터에 없으면 중립 회색 */
export const FALLBACK_SUBJECT_COLOR = "#94a3b8";
