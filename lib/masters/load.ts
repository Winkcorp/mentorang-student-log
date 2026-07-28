import { createClient } from "@/lib/supabase/server";
import type {
  Masters,
  Room,
  SessionType,
  Subject,
  TimeSlot,
} from "./types";

/**
 * 마스터 테이블(subjects / session_types / time_slots / rooms) 조회.
 *
 * 과목·세션종류·시간대·공간은 문자열로 저장하지 않는다 — 화면은 항상 여기서
 * 읽은 마스터를 기준으로 라벨·색상·정렬을 결정한다.
 *
 * 서버 전용. 타입만 필요하면 ./types에서 import할 것.
 */

// 서버 파일에서 타입까지 한 번에 가져다 쓸 수 있도록 재수출
export * from "./types";

/** 활성 마스터 전체를 display_order 순으로 가져온다. */
export async function loadMasters(): Promise<Masters> {
  const supabase = await createClient();

  const [subjects, sessionTypes, timeSlots, rooms] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, display_order, color")
      .eq("status", "active")
      .order("display_order")
      .order("name"),
    supabase
      .from("session_types")
      .select("id, code, name, requires_subject, has_progress, display_order")
      .eq("status", "active")
      .order("display_order")
      .order("code"),
    supabase
      .from("time_slots")
      .select("id, label, default_start_time, default_end_time, display_order")
      .eq("status", "active")
      .order("display_order")
      .order("label"),
    supabase
      .from("rooms")
      .select("id, name, capacity, display_order")
      .eq("status", "active")
      .order("display_order")
      .order("name"),
  ]);

  return {
    subjects: (subjects.data ?? []) as Subject[],
    sessionTypes: (sessionTypes.data ?? []) as SessionType[],
    timeSlots: (timeSlots.data ?? []) as TimeSlot[],
    rooms: (rooms.data ?? []) as Room[],
  };
}
