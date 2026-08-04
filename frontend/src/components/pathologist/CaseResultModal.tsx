import React, { useState } from "react";
import type { AxiosError } from "axios";
import { X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { predictCase } from "../../api/cases";
import type { CaseDetail, CaseListItem } from "../../types/case";
import { UnifiedCaseResultSections } from "../dashboard/UnifiedCaseResultSections";

interface CaseResultModalProps {
  caseData: CaseDetail | CaseListItem;
  loading: boolean;
  onClose: () => void;
}

export function CaseResultModal({ caseData, loading, onClose }: CaseResultModalProps): React.JSX.Element {
  const navigate = useNavigate();
  const detail = caseData as CaseDetail;
  const isCompleted = ["pending_review", "confirmed"].includes(caseData.status);

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await predictCase(caseData.id);
      navigate(`/analysis/${caseData.id}`);
    } catch (err: unknown) {
      const errorPayload = (err as AxiosError<{ error?: string | { message?: string } }>).response?.data?.error;
      const message = typeof errorPayload === "string" ? errorPayload : errorPayload?.message;
      setRetryError(message ?? "재처리 요청에 실패했습니다.");
      setRetrying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-7xl shadow-xl max-h-[92vh] flex flex-col">
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

          {!loading && isCompleted && <UnifiedCaseResultSections caseData={detail} />}
        </div>
      </div>
    </div>
  );
}
