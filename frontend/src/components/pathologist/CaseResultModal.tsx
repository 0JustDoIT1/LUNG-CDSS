import React from "react";
import { X, Loader2 } from "lucide-react";
import type { CaseDetail, CaseListItem } from "../../types/case";

interface CaseResultModalProps {
  caseData: CaseDetail | CaseListItem;
  loading: boolean;
  onClose: () => void;
}

export function CaseResultModal({ caseData, loading, onClose }: CaseResultModalProps): React.JSX.Element {
  const detail = caseData as CaseDetail;
  const luad = detail.luad_probability ?? null;
  const lusc = detail.lusc_probability ?? null;
  const conf = luad != null ? Math.max(luad, lusc ?? 0) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg text-gray-900">{caseData.specimen_id}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="닫기">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> 상세 로드 중...
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {/* 원본 이미지 */}
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-200 flex items-center justify-center">
              {detail.slide_thumbnail_url ? (
                <img
                  src={detail.slide_thumbnail_url}
                  alt="원본 슬라이드"
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-gray-500">원본 이미지가 없습니다.</span>
              )}
            </div>

            {/* LUAD/LUSC 구분 + 정확도 */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">진단 분류</span>
              <span className="font-semibold text-gray-900">{detail.prediction_label ?? "—"}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">정확도(확률)</span>
              <span className="font-semibold text-gray-900">
                {conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">LUAD 확률</span>
              <span className="text-gray-700">
                {luad != null ? `${(luad * 100).toFixed(1)}%` : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">LUSC 확률</span>
              <span className="text-gray-700">
                {lusc != null ? `${(lusc * 100).toFixed(1)}%` : "—"}
              </span>
            </div>

            {/* 유전자 예측 */}
            {detail.gene_predictions && detail.gene_predictions.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-gray-500 mb-2">유전자 변이 예측</p>
                <div className="space-y-1.5">
                  {detail.gene_predictions.map((g) => (
                    <div key={g.gene_name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">{g.gene_name}</span>
                      <span className="text-gray-700">{(g.likelihood * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI 소견 (RAG) */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2 mt-2">AI 기반 검토 소견</p>
              {detail.treatment_note ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {detail.treatment_note}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  AI 소견 생성에 실패했거나 아직 생성되지 않았습니다.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}