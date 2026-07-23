"use client";

import { useState, useTransition } from "react";
import { bulkAddOneTime, type BulkResult } from "../actions";

/**
 * GPT 학습플랜 표(주차/요일/과목/내용)를 붙여넣어 one_time 항목을 일괄 등록.
 * 실패한 행은 행 번호와 이유를 그대로 보여준다.
 */
export function BulkPasteForm({ templateId }: { templateId: string }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200/70 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          1회성 항목 일괄 붙여넣기
        </h3>
        <p className="text-xs text-gray-500">
          한 줄에 하나씩: 주차 / 요일 / 과목 / 내용 (탭·파이프(|)·쉼표 구분)
          <br />예: <code>1주 | 토 | 국어 | 모의고사 기출 1회분</code>
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"1주 | 토 | 국어 | 모의고사 기출 1회분\n2주 | 일 | 수학 | 마플 4단원 테스트"}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
      />

      <button
        type="button"
        disabled={isPending || !text.trim()}
        onClick={() =>
          startTransition(async () => {
            const r = await bulkAddOneTime(templateId, text);
            setResult(r);
            if (!r.fatal && r.errors.length === 0) setText("");
          })
        }
        className="rounded-xl bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isPending ? "등록 중..." : "일괄 등록"}
      </button>

      {result && (
        <div className="space-y-2 text-sm">
          {result.fatal ? (
            <p className="text-red-600">{result.fatal}</p>
          ) : (
            <p className="text-green-600">{result.inserted}개 행 등록 완료</p>
          )}
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="mb-1 font-medium text-red-700">
                실패한 행 {result.errors.length}개 — 수정 후 해당 행만 다시
                붙여넣으세요:
              </p>
              <ul className="space-y-0.5 text-xs text-red-600">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.line}번째 행: {e.reason}{" "}
                    <span className="text-red-400">({e.raw})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
