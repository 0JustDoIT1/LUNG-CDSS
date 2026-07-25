import React from "react";
import type { CaseDetail } from "../../types/case";
import { Row } from "./shared";

export function SummaryBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const conf =
    caseData.luad_probability != null
      ? Math.max(caseData.luad_probability, caseData.lusc_probability ?? 0)
      : null;
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

      <div className="mt-3 p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 mb-1">표적치료 노트</p>
        <p className="text-gray-700 leading-relaxed">
          {caseData.treatment_note ?? "아직 생성된 노트가 없습니다."}
        </p>
      </div>
    </div>
  );
}