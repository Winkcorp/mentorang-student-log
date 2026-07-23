"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";

/** 미리보기 — 로컬 상태로 모든 버튼이 실제로 동작한다. */

const NAV = [
  { href: "/preview/admin", label: "대시보드" },
  { href: "/preview/calendar", label: "캘린더" },
  { href: "/preview/templates", label: "템플릿" },
  { href: "/preview/plan-assign", label: "계획 배정" },
  { href: "/preview/settlements", label: "정산" },
];

interface Student {
  id: number;
  name: string;
  school: string;
  grade: string;
  parent: string;
  active: boolean;
}

interface Pending {
  id: number;
  email: string;
  role?: string;
  link?: string;
}

const inputCls = "rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none";

export default function PreviewAdminPage() {
  const [students, setStudents] = useState<Student[]>([
    { id: 1, name: "김학생", school: "한국고", grade: "고2", parent: "김학부모", active: true },
    { id: 2, name: "이학생", school: "서울고", grade: "고3", parent: "이학부모", active: true },
    { id: 3, name: "박학생", school: "대한고", grade: "고1", parent: "박학부모", active: false },
  ]);
  const [pending, setPending] = useState<Pending[]>([
    { id: 1, email: "new-mentor@example.com" },
    { id: 2, email: "parent-kim@example.com" },
  ]);
  const [approved, setApproved] = useState<Pending[]>([
    { id: 0, email: "admin@mentorang.kr", role: "admin" },
  ]);
  const [form, setForm] = useState({ name: "", school: "", grade: "", parent: "" });
  const [roleSel, setRoleSel] = useState<Record<number, { role: string; link: string }>>({});

  const activeCount = students.filter((s) => s.active).length;

  function addStudent() {
    if (!form.name.trim()) return;
    setStudents((s) => [
      ...s,
      {
        id: Date.now(),
        name: form.name.trim(),
        school: form.school.trim(),
        grade: form.grade.trim(),
        parent: form.parent || "―",
        active: true,
      },
    ]);
    setForm({ name: "", school: "", grade: "", parent: "" });
  }

  function assign(p: Pending) {
    const sel = roleSel[p.id];
    if (!sel?.role) return;
    if ((sel.role === "mentor" || sel.role === "parent") && !sel.link) return;
    setPending((list) => list.filter((x) => x.id !== p.id));
    setApproved((list) => [...list, { ...p, role: sel.role, link: sel.link }]);
  }

  function revoke(p: Pending) {
    setApproved((list) => list.filter((x) => x.id !== p.id));
    setPending((list) => [...list, { id: p.id, email: p.email }]);
  }

  const cards = [
    { label: "활성 학생", value: activeCount },
    { label: "활성 멘토", value: 5 },
    { label: "승인 대기 계정", value: pending.length },
  ];

  return (
    <AppShell title="관리자" nav={NAV} userLabel="admin@mentorang.kr">
      <div className="space-y-8">
        <section>
          <h1 className="mb-4 text-xl font-bold text-gray-900">대시보드</h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-gray-200/70 bg-white p-5">
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{c.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">학생 관리</h2>
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200/70 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">이름 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">학교</label>
              <input
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">학년</label>
              <input
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                placeholder="고2"
                className={`${inputCls} w-20`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">학부모</label>
              <select
                value={form.parent}
                onChange={(e) => setForm({ ...form, parent: e.target.value })}
                className={inputCls}
              >
                <option value="">선택 안 함</option>
                <option>김학부모</option>
                <option>이학부모</option>
              </select>
            </div>
            <button
              onClick={addStudent}
              className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
            >
              등록
            </button>
          </div>
          <ul className="space-y-2">
            {students.map((s) => (
              <li
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 ${
                  s.active ? "bg-white" : "bg-gray-100 opacity-60"
                }`}
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {s.school} {s.grade}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">학부모: {s.parent}</span>
                </div>
                <div className="flex items-center gap-3">
                  <a href="/preview/calendar" className="text-xs text-blue-600 hover:underline">
                    캘린더 보기
                  </a>
                  <button
                    onClick={() =>
                      setStudents((list) =>
                        list.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)),
                      )
                    }
                    className="text-xs text-gray-500 hover:underline"
                  >
                    {s.active ? "비활성화" : "활성화"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            계정 승인 — 승인 대기 ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((p) => {
              const sel = roleSel[p.id] ?? { role: "", link: "" };
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white p-4"
                >
                  <span className="text-sm font-medium text-gray-900">{p.email}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={sel.role}
                      onChange={(e) =>
                        setRoleSel({ ...roleSel, [p.id]: { ...sel, role: e.target.value } })
                      }
                      className={inputCls}
                    >
                      <option value="">역할 선택</option>
                      <option value="admin">admin</option>
                      <option value="mentor">mentor</option>
                      <option value="parent">parent</option>
                    </select>
                    {(sel.role === "mentor" || sel.role === "parent") && (
                      <select
                        value={sel.link}
                        onChange={(e) =>
                          setRoleSel({ ...roleSel, [p.id]: { ...sel, link: e.target.value } })
                        }
                        className={inputCls}
                      >
                        <option value="">{sel.role === "mentor" ? "멘토 연결" : "학부모 연결"}</option>
                        <option>박멘토</option>
                        <option>최멘토</option>
                        <option>김학부모</option>
                      </select>
                    )}
                    <button
                      onClick={() => assign(p)}
                      disabled={!sel.role}
                      className="rounded-xl bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                      부여
                    </button>
                  </div>
                </li>
              );
            })}
            {pending.length === 0 && (
              <p className="text-sm text-gray-400">대기 중인 계정이 없습니다.</p>
            )}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            승인된 계정 ({approved.length})
          </h2>
          <ul className="space-y-2">
            {approved.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-900">{p.email}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {p.role}
                    {p.link ? ` · ${p.link}` : ""}
                  </span>
                </div>
                {p.role !== "admin" && (
                  <button
                    onClick={() => revoke(p)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    역할 회수
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
