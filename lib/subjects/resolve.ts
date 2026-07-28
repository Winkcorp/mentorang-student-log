import { createClient } from "@/lib/supabase/server";

/**
 * 과목 이름 → id 해석.
 *
 * 붙여넣기·빠른입력처럼 사용자가 과목을 "이름"으로 주는 경로가 남아 있는데,
 * 저장은 subject_id로 해야 하므로 그 사이를 여기서 잇는다.
 *
 * 마스터에 없는 이름은 만들지 않고 실패로 돌려준다 — 오타로 과목이
 * 늘어나면 색상·정렬이 없는 유령 과목이 생기고, 그게 원래 v1의 문제였다.
 */

export interface SubjectRef {
  id: string;
  name: string;
  color: string;
}

/** 이름(공백 제거) → 과목. 비활성 과목도 포함한다(과거 데이터 표시용). */
export async function loadSubjectsByName(): Promise<Map<string, SubjectRef>> {
  const supabase = await createClient();
  const { data } = await supabase.from("subjects").select("id, name, color");

  return new Map(
    (data ?? []).map((s) => [s.name.trim(), s as SubjectRef]),
  );
}

/** 활성 과목 이름 목록 — 사용자에게 "쓸 수 있는 과목"을 알려줄 때 */
export async function activeSubjectNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subjects")
    .select("name")
    .eq("status", "active")
    .order("display_order");

  return (data ?? []).map((s) => s.name);
}
