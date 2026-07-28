"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 마스터(과목·세션유형·시간대·공간) 관리.
 *
 * 삭제는 제공하지 않는다 — 마스터를 참조하는 FK가 RESTRICT라 과거 데이터가
 * 있으면 어차피 지워지지 않고, 지워지면 이력의 라벨이 사라진다.
 * 대신 status를 inactive로 바꿔 새 선택지에서만 빼낸다.
 */

export interface Result {
  error: string | null;
}

const MASTER_TABLES = [
  "subjects",
  "session_types",
  "time_slots",
  "rooms",
] as const;
type MasterTable = (typeof MASTER_TABLES)[number];

function fail(error: unknown): Result {
  const message = error instanceof Error ? error.message : String(error);
  // 자연키 중복 — 사용자에게는 DB 문구 대신 무엇이 겹쳤는지 알려준다
  if (message.includes("duplicate key") || message.includes("23505")) {
    return { error: "이미 같은 이름(또는 코드·라벨)이 등록되어 있습니다." };
  }
  return { error: message };
}

const num = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
};

/** 과목 — 색상과 정렬순서가 화면에 그대로 쓰인다 */
export async function upsertSubject(formData: FormData): Promise<Result> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const displayOrder = num(formData.get("displayOrder"));

  if (!name) return { error: "과목명을 입력하세요." };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { error: "색상은 #RRGGBB 형식이어야 합니다." };
  }

  const supabase = await createClient();
  const row = { name, color, display_order: displayOrder };

  const { error } = id
    ? await supabase.from("subjects").update(row).eq("id", id)
    : await supabase.from("subjects").insert(row);

  if (error) return fail(error.message);

  revalidatePath("/admin/masters");
  return { error: null };
}

/** 세션유형 — code는 제목 계산에 쓰이므로 짧게 */
export async function upsertSessionType(formData: FormData): Promise<Result> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const requiresSubject = formData.get("requiresSubject") === "on";
  const hasProgress = formData.get("hasProgress") === "on";
  const displayOrder = num(formData.get("displayOrder"));

  if (!code || !name) return { error: "코드와 이름을 입력하세요." };

  const supabase = await createClient();
  const row = {
    code,
    name,
    requires_subject: requiresSubject,
    has_progress: hasProgress,
    display_order: displayOrder,
  };

  const { error } = id
    ? await supabase.from("session_types").update(row).eq("id", id)
    : await supabase.from("session_types").insert(row);

  if (error) return fail(error.message);

  revalidatePath("/admin/masters");
  return { error: null };
}

/** 시간대 — 여기 시각은 기본값일 뿐, 실제 시각은 시리즈가 보유한다 */
export async function upsertTimeSlot(formData: FormData): Promise<Result> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const start = String(formData.get("defaultStart") ?? "");
  const end = String(formData.get("defaultEnd") ?? "");
  const displayOrder = num(formData.get("displayOrder"));

  if (!label) return { error: "라벨을 입력하세요." };
  if (!start || !end) return { error: "기본 시각을 입력하세요." };
  if (end <= start) return { error: "종료 시각이 시작 시각보다 늦어야 합니다." };

  const supabase = await createClient();
  const row = {
    label,
    default_start_time: start,
    default_end_time: end,
    display_order: displayOrder,
  };

  const { error } = id
    ? await supabase.from("time_slots").update(row).eq("id", id)
    : await supabase.from("time_slots").insert(row);

  if (error) return fail(error.message);

  revalidatePath("/admin/masters");
  return { error: null };
}

/** 공간 — capacity를 비우면 단독 사용(동시 1건) */
export async function upsertRoom(formData: FormData): Promise<Result> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const displayOrder = num(formData.get("displayOrder"));

  if (!name) return { error: "공간명을 입력하세요." };

  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    return { error: "정원은 1 이상의 정수이거나 비워둬야 합니다." };
  }

  const supabase = await createClient();
  const row = { name, capacity, display_order: displayOrder };

  const { error } = id
    ? await supabase.from("rooms").update(row).eq("id", id)
    : await supabase.from("rooms").insert(row);

  if (error) return fail(error.message);

  revalidatePath("/admin/masters");
  return { error: null };
}

/** 활성/비활성 토글 — 비활성 마스터는 새 선택지에서만 빠지고 이력은 유지된다 */
export async function toggleMasterStatus(formData: FormData): Promise<void> {
  await requireRole("admin");

  const table = String(formData.get("table") ?? "") as MasterTable;
  const id = String(formData.get("id") ?? "");
  const current = String(formData.get("current") ?? "");

  if (!MASTER_TABLES.includes(table) || !id) return;

  const supabase = await createClient();
  await supabase
    .from(table)
    .update({ status: current === "active" ? "inactive" : "active" })
    .eq("id", id);

  revalidatePath("/admin/masters");
}

/** 공간 사용 불가 구간 — 충돌 검사에서 세션과 동일하게 취급된다 */
export async function createRoomBlock(formData: FormData): Promise<Result> {
  await requireRole("admin");

  const roomId = String(formData.get("roomId") ?? "");
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("startTime") ?? "");
  const end = String(formData.get("endTime") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!roomId || !date || !start || !end) {
    return { error: "공간·날짜·시각은 필수입니다." };
  }
  if (end <= start) return { error: "종료 시각이 시작 시각보다 늦어야 합니다." };

  const supabase = await createClient();
  const { error } = await supabase.from("room_blocks").insert({
    room_id: roomId,
    date,
    start_time: start,
    end_time: end,
    reason: reason || null,
  });

  if (error) return fail(error.message);

  revalidatePath("/admin/masters");
  return { error: null };
}

export async function deleteRoomBlock(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("room_blocks").delete().eq("id", id);

  revalidatePath("/admin/masters");
}
