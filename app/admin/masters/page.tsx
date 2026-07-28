import { createClient } from "@/lib/supabase/server";
import {
  MastersBoard,
  type RoomBlockRow,
  type RoomRow,
  type SessionTypeRow,
  type SubjectRow,
  type TimeSlotRow,
} from "./MastersBoard";

/**
 * 마스터 관리.
 *
 * loadMasters()는 활성 항목만 주지만 이 화면은 비활성도 보여야 하므로
 * 직접 조회한다.
 */
export default async function AdminMastersPage() {
  const supabase = await createClient();

  const [subjects, sessionTypes, timeSlots, rooms, roomBlocks] =
    await Promise.all([
      supabase
        .from("subjects")
        .select("id, name, color, display_order, status")
        .order("status")
        .order("display_order"),
      supabase
        .from("session_types")
        .select(
          "id, code, name, requires_subject, has_progress, display_order, status",
        )
        .order("status")
        .order("display_order"),
      supabase
        .from("time_slots")
        .select(
          "id, label, default_start_time, default_end_time, display_order, status",
        )
        .order("status")
        .order("display_order"),
      supabase
        .from("rooms")
        .select("id, name, capacity, display_order, status")
        .order("status")
        .order("display_order"),
      supabase
        .from("room_blocks")
        .select("id, room_id, date, start_time, end_time, reason")
        .order("date", { ascending: false })
        .limit(50),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">마스터 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          과목·세션유형·시간대·공간은 문자열로 저장하지 않고 여기서 관리합니다.
          다른 화면의 선택지·색상·정렬이 모두 이 값을 따릅니다. 삭제 대신
          비활성화만 제공합니다 — 과거 데이터의 라벨이 사라지면 안 되기
          때문입니다.
        </p>
      </div>

      <MastersBoard
        subjects={(subjects.data ?? []) as SubjectRow[]}
        sessionTypes={(sessionTypes.data ?? []) as SessionTypeRow[]}
        timeSlots={(timeSlots.data ?? []) as TimeSlotRow[]}
        rooms={(rooms.data ?? []) as RoomRow[]}
        roomBlocks={(roomBlocks.data ?? []) as RoomBlockRow[]}
      />
    </div>
  );
}
