import { AppShell } from "@/components/AppShell";

const NAV = [
  { href: "/preview/mentor", label: "내 학생" },
  { href: "/preview/mentor", label: "세션 관리" },
];

const TASKS = [
  {
    date: "2026-08-03 (월)",
    items: [
      { subject: "국어", content: "강기본 하루 2강씩", done: true, linked: false },
      { subject: "영어", content: "Day 25-27", done: true, linked: false },
      { subject: "수학", content: "수1 인강 1강 시청", done: true, linked: false },
      { subject: "수학", content: "마플 해당 단원 문제 풀이", done: false, linked: true },
    ],
  },
  {
    date: "2026-08-06 (목)",
    items: [
      { subject: "국어", content: "강기본 하루 2강씩", done: false, linked: false },
      { subject: "영어", content: "Day 25-27 복습", done: false, linked: true },
    ],
  },
];

const SESSIONS = [
  { student: "김학생", when: "2026-08-03 19:00~21:00", status: "완료", style: "bg-green-50 text-green-700", extra: null as string | null },
  { student: "이학생", when: "2026-08-03 21:00~22:30", status: "노쇼", style: "bg-red-50 text-red-700", extra: null },
  { student: "이학생", when: "2026-08-04 21:00~22:30", status: "취소", style: "bg-gray-100 text-gray-500", extra: "대체수업 있음" },
  { student: "이학생", when: "2026-08-05 21:00~22:30", status: "대체수업", style: "bg-purple-50 text-purple-700", extra: "(원 세션 연결됨)" },
];

export default function PreviewMentorPage() {
  return (
    <AppShell title="멘토" nav={NAV} userLabel="mentor@mentorang.kr">
      <div className="space-y-8">
        <section>
          <h1 className="mb-4 text-xl font-bold text-gray-900">
            김학생 과제
            <span className="ml-2 text-sm font-normal text-gray-500">
              한국고 고2
            </span>
          </h1>
          <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            후속 과제가 생성되었습니다: 2026-08-06 — Day 25-27 복습
          </div>
          <div className="space-y-4">
            {TASKS.map((g) => (
              <div key={g.date}>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  {g.date}
                </h3>
                <ul className="space-y-1">
                  {g.items.map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        defaultChecked={t.done}
                        className="h-4 w-4"
                      />
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {t.subject}
                      </span>
                      <span
                        className={`text-sm ${t.done ? "text-gray-400 line-through" : "text-gray-900"}`}
                      >
                        {t.content}
                      </span>
                      {t.linked && (
                        <span className="ml-auto rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                          연계
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            세션 관리
          </h2>
          <ul className="space-y-2">
            {SESSIONS.map((s, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div className="text-sm text-gray-900">
                  <span className="font-medium">{s.student}</span>
                  <span className="ml-2 text-gray-600">{s.when}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${s.style}`}
                  >
                    {s.status}
                  </span>
                  {s.extra && (
                    <span className="ml-1 text-xs text-purple-500">
                      {s.extra}
                    </span>
                  )}
                </div>
                {s.status !== "대체수업" && (
                  <div className="flex items-center gap-1">
                    {["완료", "노쇼", "취소"]
                      .filter((x) => x !== s.status)
                      .map((x) => (
                        <span
                          key={x}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600"
                        >
                          {x}로 변경
                        </span>
                      ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
