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

type ActionMode = "confirm" | "reject";

export function ReviewActionCell({
  caseId,
  status,
  reviewStatus,
  onReviewed,
}: ReviewActionCellProps): React.JSX.Element | null {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<ActionMode>("reject");
  const [finalDx, setFinalDx] = useState<"LUAD" | "LUSC" | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 분석 완료 + 검토 대기 상태가 아니면 액션 버튼을 노출하지 않음 (상태 배지는 다른 컬럼에서 표시)
  if (status !== "pending_review" || reviewStatus !== "pending") return null;

  function openForm(nextMode: ActionMode): void {
    setMode(nextMode);
    setShowForm(true);
    setErrorMsg(null);
  }

  function closeForm(): void {
    setShowForm(false);
    setErrorMsg(null);
    setFinalDx("");
    setNote("");
  }

  async function handleSubmit(): Promise<void> {
    setErrorMsg(null);

    let payload: Parameters<typeof reviewCase>[1];

    if (mode === "reject") {
      if (!finalDx || !note.trim()) {
        setErrorMsg("최종 진단과 사유를 모두 입력해 주세요.");
        return;
      }
      payload = {
        action: "reject",
        final_diagnosis: finalDx, // 이 블록 안에서는 "LUAD" | "LUSC"로 좁혀짐
        reviewer_note: note.trim(),
      };
    } else {
      const trimmed = note.trim();
      payload = trimmed
        ? { action: "confirm", reviewer_note: trimmed }
        : { action: "confirm" };
    }

    setSubmitting(true);
    try {
      const updated = await reviewCase(caseId, payload);
      onReviewed(updated as CaseListItem);
      closeForm();
    } catch (e) {
      setErrorMsg(mode === "confirm" ? "승인 처리에 실패했습니다." : "미승인 처리에 실패했습니다.");
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (!showForm) {
    return (
      <div className="flex gap-1.5">
        <button
          onClick={() => openForm("confirm")}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-teal-700 border border-teal-200 bg-white hover:bg-teal-50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          승인
        </button>
        <button
          onClick={() => openForm("reject")}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 border border-rose-200 bg-white hover:bg-rose-50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <XCircle className="w-3.5 h-3.5" />
          미승인
        </button>
      </div>
    );
  }

  const isReject = mode === "reject";

  return (
    <div className="absolute z-10 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-2">
      <p className="text-xs font-medium text-gray-700">
        {isReject ? "의사 최종 진단" : "AI 소견 승인"}
      </p>

      {isReject && (
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
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          isReject
            ? "AI 소견을 신뢰하지 못한 사유를 입력하세요"
            : "추가 코멘트를 입력하세요 (선택)"
        }
        rows={3}
        className={`w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 ${
          isReject
            ? "focus:ring-rose-100 focus:border-rose-300"
            : "focus:ring-teal-100 focus:border-teal-300"
        }`}
      />

      {errorMsg && <p className="text-[11px] text-rose-600">{errorMsg}</p>}

      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          onClick={closeForm}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50 ${
            isReject ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700"
          }`}
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isReject ? "제출" : "승인"}
        </button>
      </div>
    </div>
  );
}
