import React, { useState, useMemo, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import type { CaseDetail } from "../../types/case";
import { buildClinicalNote } from "../../utils/clinicalNote";
import { Row } from "./shared";

export function SummaryBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const conf =
    caseData.luad_probability != null
      ? Math.max(caseData.luad_probability, caseData.lusc_probability ?? 0)
      : null;

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

  return (
    <div className="space-y-3 text-sm">
      <Row label="진단">
        <strong>{caseData.prediction_label ?? "—"}</strong>
      </Row>
      <Row label="LUAD 확률">
        {caseData.luad_probability != null ? `${(caseData.luad_probability * 100).toFixed(1)}%` : "—"}
      </Row>
      <Row label="LUSC 확률">
        {caseData.lusc_probability != null ? `${(caseData.lusc_probability * 100).toFixed(1)}%` : "—"}
      </Row>
      <Row label="최고 정확도">{conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}</Row>

      {caseData.gene_predictions && caseData.gene_predictions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">유전자 변이 예측</p>
          <div className="space-y-1.5">
            {caseData.gene_predictions.map((g) => (
              <Row key={g.gene_name} label={g.gene_name}>
                {(g.likelihood * 100).toFixed(1)}%
              </Row>
            ))}
          </div>
        </div>
      )}

      {/* 진료 노트 자동 생성 + 복사 — 표적치료 제안은 여기 한 곳에서만 확인 */}
      <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-xs font-medium text-gray-600">EMR용 진료 노트</p>
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
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