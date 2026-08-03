import React, { useState, useMemo, useCallback } from "react";
import { Dna, Copy, Check } from "lucide-react";
import type { CaseDetail } from "../../types/case";
import { ConfidenceDetail } from "./ConfidenceIndicator";
import { AnalysisStatusNote } from "./shared";
import { buildClinicalNote } from "../../utils/clinicalNote";

export function SummaryBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  // 훅은 항상 최상단에서, 조건부 return보다 먼저 호출되어야 합니다.
  const [copied, setCopied] = useState(false);
  const note = useMemo(() => buildClinicalNote(caseData), [caseData]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(note);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = note;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [note]);

  if (!["pending_review", "confirmed"].includes(caseData.status)) {
    return <AnalysisStatusNote status={caseData.status} fallbackText="결과 요약이 아직 없습니다." />;
  }

  const luad = caseData.luad_probability;
  const lusc = caseData.lusc_probability;
  const conf = luad != null ? Math.max(luad, lusc ?? 0) : null;

  return (
    <div className="space-y-4 text-sm">
      {/* 진단 라벨 */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
        <div>
          <p className="text-xs text-gray-500">AI 진단 분류</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{caseData.prediction_label ?? "—"}</p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            caseData.prediction_label === "LUAD"
              ? "bg-indigo-50 text-indigo-600"
              : caseData.prediction_label === "LUSC"
              ? "bg-teal-50 text-teal-600"
              : "bg-gray-100 text-gray-400"
          }`}
        >
          {caseData.prediction_label === "LUAD"
            ? "선암"
            : caseData.prediction_label === "LUSC"
            ? "편평세포암"
            : "미판정"}
        </span>
      </div>

      {/* 신뢰도 상세 */}
      <div className="rounded-xl border border-gray-200 px-4 py-3.5">
        <p className="text-xs font-medium text-gray-500 mb-2">신뢰도</p>
        <ConfidenceDetail confidence={conf} luadProbability={luad} luscProbability={lusc} />
      </div>

      {/* LUAD / LUSC 확률 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3">
          <p className="text-xs font-medium text-indigo-500">LUAD 확률</p>
          <p className="text-xl font-bold text-indigo-700 mt-1 tabular-nums">
            {luad != null ? `${(luad * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-3.5 py-3">
          <p className="text-xs font-medium text-teal-600">LUSC 확률</p>
          <p className="text-xl font-bold text-teal-700 mt-1 tabular-nums">
            {lusc != null ? `${(lusc * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* 유전자 변이 예측 */}
      {caseData.gene_predictions && caseData.gene_predictions.length > 0 && (
        <div className="rounded-xl border border-gray-200 px-4 py-3.5">
          <p className="text-xs font-medium text-gray-500 mb-2.5 flex items-center gap-1.5">
            <Dna className="w-3.5 h-3.5" /> 유전자 변이 예측
          </p>
          <div className="space-y-2.5">
            {caseData.gene_predictions.map((g) => (
              <div key={g.gene_name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{g.gene_name}</span>
                  <span className="text-gray-500 tabular-nums">{(g.likelihood * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${Math.min(g.likelihood * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI 소견 */}
      {caseData.treatment_note && (
        <div className="rounded-xl border border-gray-200 px-4 py-3.5">
          <p className="text-xs font-medium text-gray-500 mb-2">AI 기반 검토 소견</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{caseData.treatment_note}</p>
        </div>
      )}

      {/* 진료 노트 자동 생성 + 복사 */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-medium text-gray-600">EMR용 진료 노트</p>
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              copied
                ? "border-teal-300 bg-teal-50 text-teal-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50/50"
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <textarea
          readOnly
          value={note}
          rows={10}
          className="w-full px-3 py-2.5 text-xs font-mono text-gray-700 bg-white resize-none focus:outline-none leading-relaxed"
        />
      </div>
    </div>
  );
}
