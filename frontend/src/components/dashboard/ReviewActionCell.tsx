import React, { useState } from "react";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
import type { CaseStatus } from "../../types/case";
import { reviewCase } from "../../api/cases";

interface ReviewActionCellProps {
  caseId: string;
  status: CaseStatus;
  onReviewed: (caseId: string) => void;
}

type ActionMode = "confirm" | "edit";

export function ReviewActionCell({
  caseId,
  status,
  onReviewed,
}: ReviewActionCellProps): React.JSX.Element | null {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<ActionMode>("edit");
  const [finalSubtype, setFinalSubtype] = useState<"LUAD" | "LUSC" | "">("");
  const [finalNote, setFinalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (status !== "pending_review") return null;

  function openForm(nextMode: ActionMode): void {
    setMode(nextMode);
    setShowForm(true);
    setErrorMsg(null);
  }

  function closeForm(): void {
    setShowForm(false);
    setErrorMsg(null);
    setFinalSubtype("");
    setFinalNote("");
  }

  async function handleSubmit(): Promise<void> {
    setErrorMsg(null);

    if (mode === "edit" && !finalSubtype) {
      setErrorMsg("최종 진단을 선택해 주세요.");
      return;
    }

    const payload: Parameters<typeof reviewCase>[1] =
      mode === "edit"
        ? {
            action: "edit",
            final_subtype: finalSubtype as "LUAD" | "LUSC",
            final_note: finalNote.trim(),
          }
        : { action: "confirm" };

    setSubmitting(true);
    try {
      const updated = await reviewCase(caseId, payload);
      if (updated.status === "confirmed") onReviewed(caseId);
      closeForm();
    } catch (error) {
      setErrorMsg(mode === "confirm" ? "승인 처리에 실패했습니다." : "수정 처리에 실패했습니다.");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!showForm) {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => openForm("confirm")}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-teal-700 border border-teal-200 bg-white hover:bg-teal-50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> 승인
        </button>
        <button
          type="button"
          onClick={() => openForm("edit")}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 border border-rose-200 bg-white hover:bg-rose-50 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <Pencil className="w-3.5 h-3.5" /> 수정
        </button>
      </div>
    );
  }

  const isEdit = mode === "edit";

  return (
    <div className="absolute z-10 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-2">
      <p className="text-xs font-medium text-gray-700">
        {isEdit ? "의사 최종 진단 수정" : "AI 소견 승인"}
      </p>

      {isEdit && (
        <>
          <div className="flex gap-1.5">
            {(["LUAD", "LUSC"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFinalSubtype(option)}
                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  finalSubtype === option
                    ? "bg-gray-900 text-white border-gray-900"
                    : "text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <textarea
            value={finalNote}
            onChange={(event) => setFinalNote(event.target.value)}
            placeholder="최종 소견 또는 수정 사유를 입력하세요 (선택)"
            rows={3}
            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-300"
          />
        </>
      )}

      {!isEdit && <p className="text-xs leading-relaxed text-gray-500">AI 분석 결과를 최종 진단으로 확정합니다.</p>}
      {errorMsg && <p className="text-[11px] text-rose-600">{errorMsg}</p>}

      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={closeForm}
          disabled={submitting}
          className="px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-50 ${
            isEdit ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700"
          }`}
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isEdit ? "수정 확정" : "승인"}
        </button>
      </div>
    </div>
  );
}
