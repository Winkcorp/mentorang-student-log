import Link from "next/link";
import { notFound } from "next/navigation";
import { WEEKDAY_LABELS } from "@/lib/dates";
import { byId, loadMasters } from "@/lib/masters/load";
import { loadMentorLoads } from "@/lib/mentors/load";
import { createClient } from "@/lib/supabase/server";
import { CapabilityForm } from "./CapabilityForm";
import { removeCapability } from "./actions";

const RATE_TYPE_LABEL: Record<string, string> = {
  hourly: "시급",
  per_session: "회당",
  flat: "고정",
};

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  candidate: "후보",
  proposed: "제안",
  confirmed: "확정",
  ended: "종료",
};

export default async function MentorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: mentor } = await supabase
    .from("mentors")
    .select("id, name, rate_type, rate_amount, status")
    .eq("id", id)
    .single();

  if (!mentor) notFound();

  const [masters, { data: capabilities }, { data: assignments }, loads] =
    await Promise.all([
      loadMasters(),
      supabase
        .from("mentor_capabilities")
        .select("id, session_type_id, subject_id")
        .eq("mentor_id", id),
      supabase
        .from("assignments")
        .select(
          "id, status, session_type_id, subject_id, start_date, students(id, name)",
        )
        .eq("mentor_id", id)
        .neq("status", "ended")
        .order("status"),
      loadMentorLoads([id]),
    ]);

  const sessionTypeById = byId(masters.sessionTypes);
  const subjectById = byId(masters.subjects);
  const load = loads.get(id);

  // 자격을 세션유형 정렬순 → 과목 정렬순으로
  const sortedCapabilities = [...(capabilities ?? [])].sort((a, b) => {
    const ta = sessionTypeById.get(a.session_type_id)?.display_order ?? 999;
    const tb = sessionTypeById.get(b.session_type_id)?.display_order ?? 999;
    if (ta !== tb) return ta - tb;
    const sa = a.subject_id ? (subjectById.get(a.subject_id)?.display_order ?? 999) : -1;
    const sb = b.subject_id ? (subjectById.get(b.subject_id)?.display_order ?? 999) : -1;
    return sa - sb;
  });

  const studentName = (rel: { name: string } | { name: string }[] | null) =>
    Array.isArray(rel) ? rel[0]?.name : rel?.name;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/mentors"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 멘토 목록
        </Link>
        <h1 className="mt-1 text-xl font-bold text-gray-900">
          {mentor.name}
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
            {RATE_TYPE_LABEL[mentor.rate_type]}{" "}
            {Number(mentor.rate_amount).toLocaleString()}원
          </span>
          {mentor.status !== "active" && (
            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600">
              비활성
            </span>
          )}
        </h1>
      </div>

      {/* ---- 부하 지표 ---------------------------------------------- */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200/70 bg-white p-5">
          <p className="text-sm text-gray-500">담당 학생 (확정 배정)</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {load?.studentCount ?? 0}명
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200/70 bg-white p-5">
          <p className="text-sm text-gray-500">요일별 세션 (오늘 이후)</p>
          <div className="mt-2 flex gap-1">
            {WEEKDAY_LABELS.slice(1).map((label, i) => {
              const count = load?.sessionsByDow[i + 1] ?? 0;
              return (
                <div
                  key={label}
                  className={`flex-1 rounded-lg py-1.5 text-center text-xs ${
                    count === 0
                      ? "bg-gray-50 text-gray-400"
                      : count >= 3
                        ? "bg-amber-100 font-semibold text-amber-800"
                        : "bg-gray-100 font-medium text-gray-700"
                  }`}
                >
                  <div>{label}</div>
                  <div className="text-sm">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- 담당 자격 ---------------------------------------------- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">담당 자격</h2>
          <p className="text-sm text-gray-500">
            배정 화면의 후보 목록은 여기 등록된 (세션유형 × 과목) 조합으로
            필터링됩니다.
          </p>
        </div>

        <CapabilityForm
          mentorId={id}
          sessionTypes={masters.sessionTypes}
          subjects={masters.subjects}
        />

        <ul className="flex flex-wrap gap-2">
          {sortedCapabilities.map((c) => {
            const type = sessionTypeById.get(c.session_type_id);
            const subject = c.subject_id ? subjectById.get(c.subject_id) : null;
            return (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-3 pr-1.5 text-sm"
              >
                <span className="font-medium text-gray-900">
                  {type?.name ?? "알 수 없는 유형"}
                </span>
                {subject ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: subject.color }}
                  >
                    {subject.name}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">과목 무관</span>
                )}
                <form action={removeCapability}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="mentorId" value={id} />
                  <button
                    type="submit"
                    aria-label="자격 삭제"
                    className="rounded-full px-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  >
                    ×
                  </button>
                </form>
              </li>
            );
          })}
          {!sortedCapabilities.length && (
            <p className="text-sm text-gray-400">
              등록된 자격이 없습니다 — 이 멘토는 어떤 후보 목록에도 나오지
              않습니다.
            </p>
          )}
        </ul>
      </section>

      {/* ---- 진행 중 배정 ------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          진행 중 배정 ({assignments?.length ?? 0})
        </h2>
        <ul className="space-y-2">
          {(assignments ?? []).map((a) => {
            const type = a.session_type_id
              ? sessionTypeById.get(a.session_type_id)
              : null;
            const subject = a.subject_id ? subjectById.get(a.subject_id) : null;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
              >
                <span className="font-medium text-gray-900">
                  {studentName(a.students)}
                </span>
                <span className="text-gray-600">{type?.name ?? "-"}</span>
                {subject && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: subject.color }}
                  >
                    {subject.name}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.status === "confirmed"
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {ASSIGNMENT_STATUS_LABEL[a.status]}
                </span>
                <span className="text-xs text-gray-400">{a.start_date}~</span>
              </li>
            );
          })}
          {!assignments?.length && (
            <p className="text-sm text-gray-400">진행 중인 배정이 없습니다.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
