import { AppShell } from "@/components/AppShell";

const NAV = [{ href: "/preview/parent", label: "이번 주 학습" }];

const TASKS = [
  {
    date: "2026-08-03 (월)",
    items: [
      { subject: "국어", content: "강기본 하루 2강씩", done: true },
      { subject: "영어", content: "Day 25-27", done: true },
      { subject: "수학", content: "수1 인강 1강 시청", done: true },
    ],
  },
  {
    date: "2026-08-04 (화)",
    items: [
      { subject: "국어", content: "강기본 하루 2강씩", done: true },
      { subject: "영어", content: "Day 28-30", done: false },
    ],
  },
  {
    date: "2026-08-06 (목)",
    items: [
      { subject: "영어", content: "Day 25-27 복습", done: false },
      { subject: "국어", content: "강기본 하루 2강씩", done: false },
    ],
  },
];

export default function PreviewParentPage() {
  const total = TASKS.flatMap((t) => t.items).length;
  const done = TASKS.flatMap((t) => t.items).filter((i) => i.done).length;
  const rate = Math.round((done / total) * 100);

  return (
    <AppShell title="학부모" nav={NAV} userLabel="parent@example.com">
      <div className="space-y-8">
        <div>
          <h1 className="mb-1 text-xl font-bold text-gray-900">이번 주 학습</h1>
          <p className="text-sm text-gray-500">2026-08-03 ~ 2026-08-09</p>
        </div>

        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              김학생
              <span className="ml-2 text-sm font-normal text-gray-500">
                한국고 고2
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${rate}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-blue-700">
                {rate}%
              </span>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            담당 멘토: <b>박멘토</b> (국어), <b>최멘토</b> (수학)
          </p>

          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-700">
              이번 주 세션
            </h3>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>
                2026-08-03 (월) 19:00~21:00
                <span className="ml-1 text-xs text-gray-400">완료</span>
              </li>
              <li>
                2026-08-05 (수) 19:00~21:00
                <span className="ml-1 text-xs text-gray-400">대체수업</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-700">
              과제 ({done}/{total})
            </h3>
            <div className="space-y-2">
              {TASKS.map((g) => (
                <div key={g.date}>
                  <p className="text-xs font-medium text-gray-500">{g.date}</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {g.items.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span
                          className={
                            t.done ? "text-green-600" : "text-gray-300"
                          }
                        >
                          {t.done ? "✓" : "○"}
                        </span>
                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                          {t.subject}
                        </span>
                        <span
                          className={
                            t.done
                              ? "text-gray-400 line-through"
                              : "text-gray-800"
                          }
                        >
                          {t.content}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
