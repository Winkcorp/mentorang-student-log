import { AppShell } from "@/components/AppShell";
import { mondayOf, plusDays } from "@/lib/dates";
import {
  ParentWeekView,
  type ChildWeek,
} from "@/components/ParentWeekView";

/** 미리보기 — 학부모 주간 학습 뷰 (mock, 주 이동 동작) */

const NAV = [{ href: "/preview/parent", label: "주간 학습" }];

function mockWeek(monday: string, today: string): ChildWeek[] {
  const days = Array.from({ length: 7 }, (_, i) => plusDays(monday, i));
  let unit = 25;

  return [
    {
      id: "s1",
      name: "김학생",
      school: "한국고",
      grade: "고2",
      mentors: [
        { name: "박멘토", subject: "국어" },
        { name: "최멘토", subject: "수학" },
      ],
      days: days.map((date, i) => {
        const past = date < today;
        const tasks =
          i === 6
            ? []
            : [
                {
                  id: `d-${date}`,
                  subject: "국어",
                  content: "강기본 하루 2강씩",
                  done: past,
                },
                {
                  id: `s-${date}`,
                  subject: "영어",
                  content: `Day ${(unit += 3) - 3}-${unit - 1}`,
                  done: past && i % 3 !== 2,
                },
                ...(i === 2
                  ? [
                      {
                        id: `r-${date}`,
                        subject: "영어",
                        content: "Day 22-24 복습",
                        done: past,
                        linked: true,
                      },
                    ]
                  : []),
              ];
        const sessions =
          i === 0 || i === 2
            ? [
                {
                  id: `ss-${date}`,
                  startTime: "19:00",
                  endTime: "21:00",
                  status: past ? "completed" : "completed",
                  mentorName: "박멘토",
                },
              ]
            : [];
        return { date, tasks, sessions };
      }),
    },
    {
      id: "s2",
      name: "김동생",
      school: "한국중",
      grade: "중3",
      mentors: [{ name: "최멘토", subject: "수학" }],
      days: days.map((date, i) => ({
        date,
        tasks:
          i >= 5
            ? []
            : [
                {
                  id: `m-${date}`,
                  subject: "수학",
                  content: "쎈 2단원 유형 10문제",
                  done: date < today && i % 2 === 0,
                },
              ],
        sessions:
          i === 4
            ? [
                {
                  id: `ms-${date}`,
                  startTime: "17:00",
                  endTime: "19:00",
                  status: i === 4 && date < today ? "no_show" : "completed",
                  mentorName: "최멘토",
                },
              ]
            : [],
      })),
    },
  ];
}

export default async function PreviewParentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "")
    ? mondayOf(params.week!)
    : mondayOf(today);
  const sunday = plusDays(monday, 6);

  return (
    <AppShell title="학부모" nav={NAV} userLabel="parent@example.com">
      <ParentWeekView
        monday={monday}
        sunday={sunday}
        today={today}
        childrenWeeks={mockWeek(monday, today)}
        prevHref={`/preview/parent?week=${plusDays(monday, -7)}`}
        nextHref={`/preview/parent?week=${plusDays(monday, 7)}`}
        todayHref="/preview/parent"
      />
    </AppShell>
  );
}
