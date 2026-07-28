import {
  ATTENDANCE_LABEL,
  ATTENDANCE_MARK,
  ATTENDANCE_STYLE,
  buildMonthlyRow,
  deriveDailyAttendance,
  summarize,
  type AttendanceStatus,
  type DayCell,
} from "@/lib/attendance/derive";
import { datesBetween, monthRange, todayISO, weekdayLabel } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { ManualEntryForm } from "./ManualEntryForm";
import { clearManualAttendance } from "./actions";

/** 출결 판정에서 제외되는 세션 상태 */
const IGNORED_STATUSES = ["canceled"];

const relName = (rel: { name: string } | { name: string }[] | null) =>
  (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; date?: string }>;
}) {
  const params = await searchParams;
  const today = todayISO();
  const month = params.month || today.slice(0, 7);
  const { start, end } = monthRange(month);
  const selectedDate =
    params.date && params.date >= start && params.date <= end
      ? params.date
      : today >= start && today <= end
        ? today
        : start;

  const supabase = await createClient();

  const [{ data: students }, { data: sessions }, { data: overrides }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, name, grade")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("sessions")
        .select("id, student_id, date, status, start_time, end_time, mentors(name)")
        .gte("date", start)
        .lte("date", end)
        .is("deleted_at", null),
      supabase
        .from("attendance_overrides")
        .select("student_id, date, status, reason")
        .gte("date", start)
        .lte("date", end),
    ]);

  const dates = datesBetween(start, end);

  // 학생 × 날짜 → 세션 목록 (취소 세션은 판정 대상이 아니라 제외)
  const liveSessions = (sessions ?? []).filter(
    (s) => !IGNORED_STATUSES.includes(s.status),
  );

  const sessionMap = new Map<string, Map<string, typeof liveSessions>>();
  for (const s of liveSessions) {
    if (!sessionMap.has(s.student_id)) sessionMap.set(s.student_id, new Map());
    const byDate = sessionMap.get(s.student_id)!;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  const overrideMap = new Map<string, Map<string, AttendanceStatus>>();
  const overrideReason = new Map<string, string | null>();
  for (const o of overrides ?? []) {
    if (!overrideMap.has(o.student_id)) overrideMap.set(o.student_id, new Map());
    overrideMap
      .get(o.student_id)!
      .set(o.date, o.status as AttendanceStatus);
    overrideReason.set(`${o.student_id}|${o.date}`, o.reason);
  }

  const rows = (students ?? []).map((student) => {
    const cells = buildMonthlyRow(
      dates,
      sessionMap.get(student.id) ?? new Map(),
      overrideMap.get(student.id) ?? new Map(),
    );
    return { student, cells, counts: summarize(cells) };
  });

  // ---- 선택한 날짜의 일 단위 요약 --------------------------------------
  const dayRows = (students ?? []).map((student) => {
    const daySessions =
      sessionMap.get(student.id)?.get(selectedDate) ?? [];
    const derived = deriveDailyAttendance(daySessions);
    const override = overrideMap.get(student.id)?.get(selectedDate) ?? null;
    return {
      student,
      sessions: daySessions,
      derived,
      override,
      reason: overrideReason.get(`${student.id}|${selectedDate}`) ?? null,
      // 세션이 없는 날만 수동 입력 허용
      manualAllowed: daySessions.length === 0,
    };
  });

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">출결</h1>
        <p className="mt-1 text-sm text-gray-500">
          출결은 별도로 기록하지 않고 세션 상태에서 계산합니다 (완료·대체수업 =
          출석, 노쇼 = 결석, 섞이면 부분출석). 취소·예정 세션은 판정에서
          제외됩니다.
        </p>
      </div>

      {/* ---- 월 선택 ------------------------------------------------- */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            월
          </label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            일 단위 조회
          </label>
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            min={start}
            max={end}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          조회
        </button>
        <div className="ml-2 flex gap-2 text-xs text-blue-600">
          <a href={`?month=${prevMonth}`} className="hover:underline">
            ← {prevMonth}
          </a>
          <a href={`?month=${nextMonth}`} className="hover:underline">
            {nextMonth} →
          </a>
        </div>
      </form>

      {/* ---- 월간 출결 표 -------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          월간 출결 표 ({month})
        </h2>

        <div className="mb-2 flex flex-wrap gap-3 text-xs text-gray-500">
          {(["present", "partial", "absent", "none"] as AttendanceStatus[]).map(
            (s) => (
              <span key={s} className="flex items-center gap-1">
                <span
                  className={`inline-block w-5 rounded text-center ${ATTENDANCE_STYLE[s]}`}
                >
                  {ATTENDANCE_MARK[s]}
                </span>
                {ATTENDANCE_LABEL[s]}
              </span>
            ),
          )}
          <span className="text-gray-400">
            점선 테두리 = 수동 입력 (세션이 없는 날)
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200/70 bg-white">
          <table className="text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-medium">
                  학생
                </th>
                {dates.map((d) => (
                  <th
                    key={d}
                    className="w-7 px-0 py-2 text-center font-normal"
                    title={d}
                  >
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[10px] text-gray-400">
                      {weekdayLabel(d)}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium">집계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ student, cells, counts }) => (
                <tr key={student.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium text-gray-900">
                    {student.name}
                    <span className="ml-1 text-[10px] text-gray-400">
                      {student.grade}
                    </span>
                  </td>
                  {cells.map((cell) => (
                    <MonthCell key={cell.date} cell={cell} />
                  ))}
                  <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">
                    <span className="text-green-700">{counts.present}</span>
                    {" / "}
                    <span className="text-amber-700">{counts.partial}</span>
                    {" / "}
                    <span className="text-red-700">{counts.absent}</span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    colSpan={dates.length + 2}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    활성 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- 일 단위 요약 -------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          일 단위 출결 — {selectedDate} ({weekdayLabel(selectedDate)})
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          세션이 있는 날은 세션 상태에서 파생되므로 수동 입력 필드가 나오지
          않습니다.
        </p>

        <ul className="space-y-2">
          {dayRows.map((row) => {
            const status = row.manualAllowed
              ? (row.override ?? "none")
              : row.derived;

            // 세션은 있는데 아직 판정 대상이 아닌 경우(예정만 있는 날).
            // "세션 없음"으로 표시하면 바로 옆 "세션 N건"과 모순돼 보인다.
            const label =
              status === "none" && row.sessions.length > 0
                ? "판정 전"
                : ATTENDANCE_LABEL[status];

            return (
              <li
                key={row.student.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
              >
                <span className="w-20 text-sm font-medium text-gray-900">
                  {row.student.name}
                </span>

                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATTENDANCE_STYLE[status]}`}
                >
                  {ATTENDANCE_MARK[status]} {label}
                </span>

                {row.sessions.length > 0 ? (
                  <span className="text-xs text-gray-500">
                    세션 {row.sessions.length}건 —{" "}
                    {row.sessions
                      .map(
                        (s) =>
                          `${String(s.start_time).slice(0, 5)} ${relName(
                            s.mentors as never,
                          )}(${s.status})`,
                      )
                      .join(", ")}
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-gray-400">세션 없음</span>
                    <div className="ml-auto flex items-center gap-2">
                      <ManualEntryForm
                        studentId={row.student.id}
                        date={selectedDate}
                        current={row.override}
                        currentReason={row.reason}
                      />
                      {row.override && (
                        <form action={clearManualAttendance}>
                          <input
                            type="hidden"
                            name="studentId"
                            value={row.student.id}
                          />
                          <input
                            type="hidden"
                            name="date"
                            value={selectedDate}
                          />
                          <button
                            type="submit"
                            className="text-xs text-gray-400 hover:text-red-500 hover:underline"
                          >
                            지우기
                          </button>
                        </form>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function MonthCell({ cell }: { cell: DayCell }) {
  return (
    <td className="px-0 py-1.5 text-center">
      <span
        title={`${cell.date} — ${ATTENDANCE_LABEL[cell.status]}${
          cell.manual ? " (수동 입력)" : ""
        }`}
        className={`inline-block w-5 rounded text-center ${ATTENDANCE_STYLE[cell.status]} ${
          cell.manual ? "border border-dashed border-gray-400" : ""
        }`}
      >
        {ATTENDANCE_MARK[cell.status]}
      </span>
    </td>
  );
}

/** "YYYY-MM" ± n개월 */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
