import React from "react";
import { X, Loader2, Printer } from "lucide-react";
import type { CaseDetail, CaseListItem, ModalType } from "../../types/case";
import { HeatmapBody } from "./HeatmapBody";
import { SummaryBody } from "./SummaryBody";
import { NucleusBody } from "./NucleusBody";
import { PrintableReport } from "./PrintableReport";

interface DetailModalProps {
  caseData: CaseDetail | CaseListItem;
  type: ModalType;
  loading: boolean;
  onClose: () => void;
}

export function DetailModal({ caseData, type, loading, onClose }: DetailModalProps): React.JSX.Element {
  const titles: Record<ModalType, string> = {
    heatmap: "히트맵",
    summary: "결과 요약",
    nucleus: "핵형태 분석",
  };
  const isWide = type === "heatmap" || type === "nucleus";
  const isCompleted = caseData.status === "completed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`bg-white rounded-2xl w-full shadow-xl flex flex-col max-h-[90vh] ${
          isWide ? "max-w-5xl" : "max-w-lg"
        }`}
      >
        {/* 헤더: 고정 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <h3 className="font-semibold text-lg text-gray-900">{titles[type]}</h3>
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

        {/* 본문: 스크롤 */}
        <div className="px-5 pb-5 overflow-y-auto">
          <p className="text-sm text-gray-600 mb-3">
            {caseData.specimen_id}
            {caseData.prediction_label ? ` — ${caseData.prediction_label}` : ""}
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> 상세 로드 중...
            </div>
          )}

          {!loading && type === "heatmap" && <HeatmapBody caseData={caseData as CaseDetail} />}
          {!loading && type === "summary" && <SummaryBody caseData={caseData as CaseDetail} />}
          {!loading && type === "nucleus" && <NucleusBody caseData={caseData as CaseDetail} />}
        </div>
      </div>

      {/* 화면에는 보이지 않고, 인쇄/PDF 저장 시에만 노출되는 리포트 */}
      {!loading && isCompleted && <PrintableReport caseData={caseData as CaseDetail} />}
    </div>
  );
}