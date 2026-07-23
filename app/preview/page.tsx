import Link from "next/link";

const SCREENS = [
  {
    href: "/preview/login",
    title: "로그인 / 가입",
    desc: "이메일 로그인, 가입 후 관리자 승인 대기",
  },
  {
    href: "/preview/admin",
    title: "관리자 — 대시보드·학생·계정 승인",
    desc: "현황 카드, 학생/멘토 관리, 역할 부여",
  },
  {
    href: "/preview/templates",
    title: "관리자 — 템플릿 상세",
    desc: "유형별 학습 항목 추가 폼 + GPT 표 일괄 붙여넣기",
  },
  {
    href: "/preview/plan-assign",
    title: "관리자 — 계획 배정",
    desc: "학생+템플릿+시작일 → 사전 점검 → 과제 자동 생성",
  },
  {
    href: "/preview/settlements",
    title: "관리자 — 정산",
    desc: "월별 배치, 확정/지급, 수동 조정, 변경 감지 경고",
  },
  {
    href: "/preview/mentor",
    title: "멘토 — 내 학생·과제 체크·세션",
    desc: "과제 체크리스트(복습 자동 생성), 세션 기록/노쇼/대체수업",
  },
  {
    href: "/preview/parent",
    title: "학부모 — 이번 주 학습",
    desc: "완료율, 과제 현황, 담당 멘토, 세션 일정 (read-only)",
  },
];

export default function PreviewIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">
        멘토랑 화면 미리보기
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        Supabase 연결 전 UI 확인용입니다. 모든 데이터는 mock이며, 실제
        화면과 동일한 컴포넌트를 사용합니다.
      </p>
      <ul className="space-y-3">
        {SCREENS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50"
            >
              <p className="font-semibold text-gray-900">{s.title}</p>
              <p className="text-sm text-gray-500">{s.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
