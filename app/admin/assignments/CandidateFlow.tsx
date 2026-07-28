"use client";

import { useState, useTransition } from "react";
import { WEEKDAY_LABELS } from "@/lib/dates";
import type { SessionType, Subject } from "@/lib/masters/types";
import {
  addCandidate,
  loadCandidateMentors,
  type CandidateMentor,
} from "./actions";

const inputCls =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-gray-500";

const STATUS_LABEL: Record<string, string> = {
  candidate: "후보 등록됨",
  proposed: "제안됨",
  confirmed: "확정됨",
};

/**
 * 후보 탐색 → 후보 등록.
 *
 * 자격(mentor_capabilities) 없는 멘토는 애초에 목록에 나오지 않는다.
 * 각 후보 옆에 담당 학생 수·요일별 세션 수를 붙여 과부하를 눈으로 판단하게 한다.
 */
export function CandidateFlow({
  students,
  sessionTypes,
  subjects,
}: {
  students: { id: string; name: string }[];
  sessionTypes: SessionType[];
  subjects: Subject[];
}) {
  const [studentId, setStudentId] = useState("");
  const [sessionTypeId, setSessionTypeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [total, setTotal] = useState("");
  const [mentors, setMentors] = useState<CandidateMentor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const selectedType = sessionTypes.find((t) => t.id === sessionTypeId);
  const needsSubject = selectedType?.requires_subject ?? false;
  const hasProgress = selectedType?.has_progress ?? false;

  const reset = () => {
    setMentors(null);
    setError(null);
    setAdded({});
  };

  const ready = studentId && sessionTypeId && (!needsSubject || subjectId);

  function search() {
    startTransition(async () => {
      const r = await loadCandidateMentors(
        studentId,
        sessionTypeId,
        needsSubject ? subjectId : null,
      );
      setError(r.error ?? null);
      setMentors(r.mentors ?? null);
      setAdded({});
    });
  }

  function register(mentorId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("studentId", studentId);
      fd.set("mentorId", mentorId);
      fd.set("sessionTypeId", sessionTypeId);
      if (needsSubject) fd.set("subjectId", subjectId);
      fd.set("startDate", startDate);
      fd.set("memo", memos[mentorId] ?? "");
      if (hasProgress) {
        fd.set("progressUnitLabel", unitLabel);
        fd.set("progressTotal", total);
      }

      const r = await addCandidate(fd);
      setAdded((prev) => ({
        ...prev,
        [mentorId]: r.error ?? "ok",
      }));
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-gray-200/70 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>학생 *</label>
            <select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                reset();
              }}
              className={inputCls}
            >
              <option value="">선택</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>세션유형 *</label>
            <select
              value={sessionTypeId}
              onChange={(e) => {
                setSessionTypeId(e.target.value);
                setSubjectId("");
                reset();
              }}
              className={inputCls}
            >
              <option value="">선택</option>
              {sessionTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.requires_subject ? "" : " (과목 무관)"}
                </option>
              ))}
            </select>
          </div>

          {needsSubject && (
            <div>
              <label className={labelCls}>과목 *</label>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  reset();
                }}
                className={inputCls}
              >
                <option value="">선택</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            disabled={!ready || isPending}
            onClick={search}
            className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isPending ? "조회 중..." : "후보 찾기"}
          </button>
        </div>

        {mentors && (
          <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
            <div>
              <label className={labelCls}>시작일 *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            {hasProgress && (
              <>
                <div>
                  <label className={labelCls}>진도 단위</label>
                  <input
                    value={unitLabel}
                    onChange={(e) => setUnitLabel(e.target.value)}
                    placeholder="강"
                    className={`${inputCls} w-20`}
                  />
                </div>
                <div>
                  <label className={labelCls}>총 진도</label>
                  <input
                    type="number"
                    min="1"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    placeholder="40"
                    className={`${inputCls} w-24`}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {mentors && !mentors.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          이 조합에 자격이 있는 활성 멘토가 없습니다. 멘토 상세 화면에서 담당
          자격을 먼저 등록하세요.
        </div>
      )}

      {mentors && mentors.length > 0 && (
        <ul className="space-y-2">
          {mentors.map((m) => {
            const result = added[m.id];
            const registered = result === "ok" || !!m.existingStatus;
            return (
              <li
                key={m.id}
                className="rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {m.name}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      담당 {m.studentCount}명
                    </span>
                    <span className="flex gap-0.5">
                      {WEEKDAY_LABELS.slice(1).map((label, i) => {
                        const count = m.sessionsByDow[i + 1] ?? 0;
                        return (
                          <span
                            key={label}
                            title={`${label}요일 세션 ${count}건`}
                            className={`w-6 rounded text-center text-[11px] leading-5 ${
                              count === 0
                                ? "bg-gray-50 text-gray-300"
                                : count >= 3
                                  ? "bg-amber-100 font-semibold text-amber-800"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {count || "·"}
                          </span>
                        );
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {m.existingStatus ? (
                      <span className="text-xs text-gray-500">
                        {STATUS_LABEL[m.existingStatus] ?? m.existingStatus}
                      </span>
                    ) : result === "ok" ? (
                      <span className="text-xs font-medium text-green-600">
                        후보 등록 완료
                      </span>
                    ) : (
                      <>
                        <input
                          value={memos[m.id] ?? ""}
                          onChange={(e) =>
                            setMemos((prev) => ({
                              ...prev,
                              [m.id]: e.target.value,
                            }))
                          }
                          placeholder="검토 메모"
                          className={`${inputCls} w-56`}
                        />
                        <button
                          type="button"
                          disabled={isPending || !startDate}
                          onClick={() => register(m.id)}
                          title={!startDate ? "시작일을 먼저 입력하세요" : undefined}
                          className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          후보 등록
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {result && result !== "ok" && (
                  <p className="mt-2 text-xs text-red-600">{result}</p>
                )}
                {registered && m.sessionsByDow.some((c) => c >= 3) && (
                  <p className="mt-2 text-xs text-amber-600">
                    특정 요일에 세션이 3건 이상입니다 — 과부하를 확인하세요.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
