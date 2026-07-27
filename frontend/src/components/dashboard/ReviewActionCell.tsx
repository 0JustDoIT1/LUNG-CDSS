import React, { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { CaseListItem, CaseStatus, ReviewStatus } from "../../types/case";
import { reviewCase } from "../../api/cases";

interface ReviewActionCellProps {
  caseId: string;
  status: CaseStatus;
  reviewStatus: ReviewStatus | null;
  onReviewed: (updated: CaseListItem) => void;
}

export function ReviewActionCell({
  caseId,
  status,
  reviewStatus,
  onReviewed,
}: ReviewActionCellProps): React.JSX.Element | null {
  const [showForm, setShowForm] = useState(false);
  const [finalDx, setFinalDx] = useState<"LUAD" | "LUSC" | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 분석 완료 + 검토 대기 상태가 아니면 액션 버튼을 노출하지 않음 (상태 배지는 다른 컬럼에서 표시)
  if (status !== "completed" || reviewStatus !== "pending") return null;

  async function handleConfirm(): Promise<void> {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const updated = await reviewCase(caseId, { action: "confirm" });
      onReviewed(updated as CaseListItem);
    } catch (e) {
      setErrorMsg("승인 처리에 실패했습니다.");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(): Promise<void> {
    if (!finalDx || !note.trim()) {
      setErrorMsg("최종 진단과 사유를 모두 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const updated = await reviewCase(caseId, {
        action: "reject",
        final_diagnosis: finalDx,
        reviewer_note: note.trim(),
      });
      onReviewed(updated as CaseListItem);
      setShowForm(false);
    } catch (e) {
      setErrorMsg("미승인 처리에 실패했습니다.");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (!showForm) {
    return (
      <div className="flex gap-1.5">
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-teal-700 border border-teal-200 bg-white hover:bg-teal-50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          승인
        </button>
        <button
          onClick={() => setShowForm(true)}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 border border-rose-200 bg-white hover:bg-rose-50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <XCircle className="w-3.5 h-3.5" />
          미승인
        </button>
      </div>
    );
  }

  return (
    <div className="absolute z-10 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-2">
      <p className="text-xs font-medium text-gray-700">의사 최종 진단</p>
      <div className="flex gap-1.5">
        {(["LUAD", "LUSC"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setFinalDx(opt)}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              finalDx === opt
                ? "bg-gray-900 text-white border-gray-900"
                : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="AI 소견을 신뢰하지 못한 사유를 입력하세요"
        rows={3}
        className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300"
      />
      {errorMsg && <p className="text-[11px] text-rose-600">{errorMsg}</p>}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          onClick={() => {
            setShowForm(false);
            setErrorMsg(null);
          }}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          취소
        </button>
        <button
          onClick={handleReject}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          제출
        </button>
      </div>
    </div>
  );
}