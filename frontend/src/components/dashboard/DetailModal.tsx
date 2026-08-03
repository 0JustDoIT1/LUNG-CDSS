import React from "react";
import { X, Loader2, Printer } from "lucide-react";
import type { CaseDetail, CaseListItem } from "../../types/case";
import { UnifiedCaseResultSections } from "./UnifiedCaseResultSections";
import { PrintableReport } from "./PrintableReport";

interface DetailModalProps {
  caseData: CaseDetail | CaseListItem;
  loading: boolean;
  onClose: () => void;
}

export function DetailModal({ caseData, loading, onClose }: DetailModalProps): React.JSX.Element {
  const isCompleted = ["completed", "pending_review", "confirmed"].includes(caseData.status);
  const detail = caseData as CaseDetail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full shadow-xl flex flex-col max-h-[92vh] max-w-7xl">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 shrink-0 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-lg text-gray-900">통합 결과 보기</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {caseData.specimen_id}
              {caseData.prediction_label ? ` · ${caseData.prediction_label}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!loading && isCompleted && (
              <button
                onClick={() => window.print()}
                title="인쇄 / PDF로 저장"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50/50 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                인쇄 / PDF
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="닫기">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-5 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-10 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> 상세 로드 중...
            </div>
          )}

          {!loading && isCompleted && <UnifiedCaseResultSections caseData={detail} />}
        </div>
      </div>

      {!loading && isCompleted && <PrintableReport caseData={detail} />}
    </div>
  );
}
