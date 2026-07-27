import React, { useState } from "react";
import { X, Loader2, Dna } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { retryCase } from "../../api/cases";
import type { CaseDetail, CaseListItem } from "../../types/case";

interface CaseResultModalProps {
  caseData: CaseDetail | CaseListItem;
  loading: boolean;
  onClose: () => void;
}

export function CaseResultModal({ caseData, loading, onClose }: CaseResultModalProps): React.JSX.Element {
  const navigate = useNavigate();
  const detail = caseData as CaseDetail;
  const luad = detail.luad_probability ?? null;
  const lusc = detail.lusc_probability ?? null;
  const conf = luad != null ? Math.max(luad, lusc ?? 0) : null;

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryCase(caseData.id);
      navigate(`/analysis/${caseData.id}`);
    } catch (err: any) {
      const message = err?.response?.data?.error;
      setRetryError(message || "재처리 요청에 실패했습니다.");
      setRetrying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
        {/* 헤더 - 스크롤해도 항상 보임 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-lg text-gray-900">케이스 상세결과</h3>
            <p className="text-xs text-gray-400 mt-0.5">{caseData.specimen_id}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="닫기">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

      
        <div className="px-5 py-4 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="w-10 h-10 text-[#185fa5] animate-spin" />
              <p className="text-sm text-gray-500">상세결과 로드 중...</p>
            </div>
          )}

          {!loading && caseData.status === "uploaded" && (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500 mb-4">분석 준비중입니다.</p>
              <button
                type="button"
                onClick={() => navigate(`/analysis/${caseData.id}`)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[#185fa5] text-white hover:bg-[#144d8a] transition"
              >
                분석 시작 →
              </button>
            </div>
          )}

          {!loading && caseData.status === "processing" && (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-500 mb-4">분석이 진행 중입니다.</p>
              <button
                type="button"
                onClick={() => navigate(`/analysis/${caseData.id}`)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[#185fa5] text-white hover:bg-[#144d8a] transition"
              >
                분석 진행 상황 보기 →
              </button>
            </div>
          )}

        {!loading && caseData.status === "failed" && (
          <div className="py-10 text-center">
            <p className="text-sm text-rose-600 mb-4">분석 실패하였습니다.</p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[#185fa5] text-white hover:bg-[#144d8a] transition disabled:opacity-50"
            >
              {retrying ? "재처리 요청 중..." : "재처리 시작 →"}
            </button>
            {retryError && <p className="text-xs text-red-500 mt-2">{retryError}</p>}
          </div>
        )}

        {!loading && caseData.status === "completed" && (
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
            
            {/* 진단 결과 카드 */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                <span className="text-sm">🔬</span>
                <span className="text-xs font-semibold text-gray-700">진단 결과</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">진단 분류</span>
                  <span
                    className={`font-bold text-base ${
                      detail.prediction_label === "LUAD" ? "text-indigo-600" : "text-teal-600"
                    }`}
                  >
                    {detail.prediction_label ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">정확도(확률)</span>
                  <span className="font-semibold text-gray-900">
                    {conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              <div className="pt-1.5 border-t border-gray-100 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-indigo-50 px-3 py-3 text-center">
                  <p className="text-xs text-indigo-400 font-medium mb-1">LUAD</p>
                  <p className="text-xl font-bold text-indigo-700">
                    {luad != null ? `${(luad * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-teal-50 px-3 py-3 text-center">
                  <p className="text-xs text-teal-500 font-medium mb-1">LUSC</p>
                  <p className="text-xl font-bold text-teal-700">
                    {lusc != null ? `${(lusc * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
              </div>
            </div>
                  
            {/* 유전자 변이 예측 카드 */}
            {detail.gene_predictions && detail.gene_predictions.length > 0 && (
              <div className="rounded-xl border border-gray-200 px-4 py-3.5 bg-white">
                <p className="text-xs font-medium text-gray-500 mb-2.5 flex items-center gap-1.5">
                  <Dna className="w-3.5 h-3.5" /> 유전자 변이 예측
                </p>
                <div className="space-y-2.5">
                  {detail.gene_predictions.map((g) => (
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
        
            {/* AI 소견 카드 */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-700">AI 기반 검토 소견</span>
              </div>
              <div className="px-4 py-3">
                {detail.treatment_note ? (
                  <div className="space-y-2">
                    {detail.treatment_note.split("\n").map((line, i) => {
                      const isHeading = /^\d+\.\s/.test(line.trim());
                      if (!line.trim()) return null;
                      return isHeading ? (
                        <p
                          key={i}
                          className="text-sm font-bold text-gray-900 mt-4 pt-3 first:mt-0 first:pt-0 border-t border-gray-100 first:border-0"
                        >
                          {line}
                        </p>
                      ) : (
                        <p key={i} className="text-sm text-gray-700 leading-relaxed">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    AI 소견 생성에 실패했거나 아직 생성되지 않았습니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}