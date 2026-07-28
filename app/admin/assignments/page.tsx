import Link from "next/link";
import { daysSince } from "@/lib/dates";
import { byId, loadMasters } from "@/lib/masters/load";
import { createClient } from "@/lib/supabase/server";
import { CandidateFlow } from "./CandidateFlow";
import { ConfirmButton } from "./ConfirmButton";
import { MemoForm } from "./MemoForm";
import { endAssignment } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  candidate: "후보",
  proposed: "제안",
  confirmed: "확정",
  ended: "종료",
};

const STATUS_STYLE: Record<string, string> = {
  candidate: "bg-amber-50 text-amber-700",
  proposed: "bg-blue-50 text-blue-700",
  confirmed: "bg-green-50 text-green-700",
  ended: "bg-gray-100 text-gray-500",
};

interface AssignmentRow {
  id: string;
  student_id: string;
  mentor_id: string;
  session_type_id: string | null;
  subject_id: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
  memo: string | null;
  created_at: string;
  progress_unit_label: string | null;
  progress_total: number | null;
  students: { name: string } | { name: string }[] | null;
  mentors: { name: string } | { name: string }[] | null;
}

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "?";

export default async function AdminAssignmentsPage() {
  const supabase = await createClient();

  const [{ data: assignments }, { data: students }, masters] =
    await Promise.all([
      supabase
        .from("assignments")
        .select(
          "id, student_id, mentor_id, session_type_id, subject_id, status, start_date, end_date, memo, created_at, progress_unit_label, progress_total, students(name), mentors(name)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("students")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
      loadMasters(),
    ]);

  const sessionTypeById = byId(masters.sessionTypes);
  const subjectById = byId(masters.subjects);

  const rows = (assignments ?? []) as unknown as AssignmentRow[];
  const live = rows.filter((a) => a.status !== "ended");
  const ended = rows.filter((a) => a.status === "ended");

  // (학생, 세션유형, 과목) 조합별로 묶는다 — 후보 비교가 이 단위로 이루어진다
  const groups = new Map<string, AssignmentRow[]>();
  for (const a of live) {
    const key = `${a.student_id}|${a.session_type_id ?? ""}|${a.subject_id ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  // 확정 없는 조합을 위로 (검토가 필요한 것부터)
  const sortedGroups = [...groups.values()].sort((a, b) => {
    const aConfirmed = a.some((x) => x.status === "confirmed") ? 1 : 0;
    const bConfirmed = b.some((x) => x.status === "confirmed") ? 1 : 0;
    return aConfirmed - bConfirmed;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">배정 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          후보를 여러 명 등록해두고 비교한 뒤 한 명을 확정합니다. 확정하면 같은
          조합의 나머지 후보는 자동으로 종료됩니다.
        </p>
      </div>

      <CandidateFlow
        students={students ?? []}
        sessionTypes={masters.sessionTypes}
        subjects={masters.subjects}
      />

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          진행 중 배정 ({live.length})
        </h2>

        {sortedGroups.map((group) => {
          const head = group[0];
          const type = head.session_type_id
            ? sessionTypeById.get(head.session_type_id)
            : null;
          const subject = head.subject_id
            ? subjectById.get(head.subject_id)
            : null;
          const hasConfirmed = group.some((a) => a.status === "confirmed");

          return (
            <div
              key={`${head.student_id}|${head.session_type_id}|${head.subject_id}`}
              className="rounded-2xl border border-gray-200/70 bg-white"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-gray-900">
                  {relName(head.students)}
                </span>
                <span className="text-sm text-gray-600">
                  {type?.name ?? "세션유형 미지정"}
                </span>
                {subject && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: subject.color }}
                  >
                    {subject.name}
                  </span>
                )}
                {head.progress_total && (
                  <span className="text-xs text-gray-400">
                    진도 총 {head.progress_total}
                    {head.progress_unit_label ?? ""}
                  </span>
                )}
                {!hasConfirmed && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    미확정
                  </span>
                )}
              </div>

              <ul className="divide-y divide-gray-100">
                {group.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/mentors/${a.mentor_id}`}
                          className="text-sm font-medium text-gray-900 hover:underline"
                        >
                          {relName(a.mentors)}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}
                        >
                          {STATUS_LABEL[a.status]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {a.start_date}~
                        </span>
                        {a.status === "candidate" &&
                          daysSince(a.created_at) >= 7 && (
                            <span className="text-xs font-medium text-red-500">
                              {daysSince(a.created_at)}일 방치
                            </span>
                          )}
                      </div>

                      <div className="flex items-center gap-2">
                        {a.status !== "confirmed" && (
                          <ConfirmButton assignmentId={a.id} />
                        )}
                        <form action={endAssignment}>
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="text-xs text-gray-400 hover:text-red-500 hover:underline"
                          >
                            {a.status === "confirmed" ? "담당 종료" : "후보 탈락"}
                          </button>
                        </form>
                      </div>
                    </div>

                    <div className="mt-2">
                      <MemoForm assignmentId={a.id} memo={a.memo} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {!live.length && (
          <p className="text-sm text-gray-400">진행 중인 배정이 없습니다.</p>
        )}
      </section>

      {ended.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            종료됨 ({ended.length})
          </h2>
          <ul className="space-y-1">
            {ended.map((a) => {
              const type = a.session_type_id
                ? sessionTypeById.get(a.session_type_id)
                : null;
              const subject = a.subject_id
                ? subjectById.get(a.subject_id)
                : null;
              return (
                <li
                  key={a.id}
                  className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-500 opacity-70"
                >
                  {relName(a.students)} ← {relName(a.mentors)} ·{" "}
                  {type?.name ?? "-"}
                  {subject ? ` · ${subject.name}` : ""} · {a.start_date} ~{" "}
                  {a.end_date ?? ""}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
