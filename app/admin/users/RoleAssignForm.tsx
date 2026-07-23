"use client";

import { useState, useTransition } from "react";
import { assignRole } from "./actions";

interface Option {
  id: string;
  name: string;
}

export function RoleAssignForm({
  profileId,
  mentors,
  parents,
}: {
  profileId: string;
  mentors: Option[];
  parents: Option[];
}) {
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const linkOptions =
    role === "mentor" ? mentors : role === "parent" ? parents : [];

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const result = await assignRole(formData);
          setError(result?.error ?? null);
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <select
        name="role"
        required
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
      >
        <option value="">역할 선택</option>
        <option value="admin">admin</option>
        <option value="mentor">mentor</option>
        <option value="parent">parent</option>
      </select>

      {(role === "mentor" || role === "parent") && (
        <select
          name="linkId"
          required
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">
            {role === "mentor" ? "멘토 연결" : "학부모 연결"}
          </option>
          {linkOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="submit"
        disabled={isPending || !role}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "저장 중..." : "부여"}
      </button>

      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
