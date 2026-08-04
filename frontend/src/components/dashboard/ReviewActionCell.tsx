import React, { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, Pencil, X } from "lucide-react";
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
  const dialogTitleId = useId();

  function openForm(nextMode: ActionMode): void {
    setMode(nextMode);
    setShowForm(true);
    setErrorMsg(null);
  }

  const closeForm = useCallback((): void => {
    setShowForm(false);
    setErrorMsg(null);
    setFinalSubtype("");
    setFinalNote("");
  }, []);

  useEffect(() => {
    if (!showForm) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !submitting) closeForm();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeForm, showForm, submitting]);

  if (status !== "pending_review") return null;

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

  const isEdit = mode === "edit";
  const dialog =
    showForm && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[1px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !submitting) closeForm();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isEdit ? "bg-rose-50 text-rose-600" : "bg-teal-50 text-teal-600"
                    }`}
                  >
                    {isEdit ? <Pencil className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <div>
                    <h3 id={dialogTitleId} className="text-base font-semibold text-gray-900">
                      {isEdit ? "의사 최종 진단 수정" : "AI 소견 승인"}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">
                      {isEdit
                        ? "최종 진단과 필요한 소견을 입력해 확정합니다."
                        : "AI 분석 결과를 최종 진단으로 확정합니다."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  aria-label="닫기"
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                {isEdit && (
                  <>
                    <fieldset>
                      <legend className="mb-2 text-xs font-medium text-gray-700">최종 진단</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {(["LUAD", "LUSC"] as const).map((option, index) => (
                          <button
                            key={option}
                            type="button"
                            autoFocus={index === 0}
                            onClick={() => setFinalSubtype(option)}
                            aria-pressed={finalSubtype === option}
                            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                              finalSubtype === option
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-gray-700">최종 소견</span>
                      <textarea
                        value={finalNote}
                        onChange={(event) => setFinalNote(event.target.value)}
                        placeholder="최종 소견 또는 수정 사유를 입력하세요 (선택)"
                        rows={4}
                        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                      />
                    </label>
                  </>
                )}

                {!isEdit && (
                  <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm leading-relaxed text-teal-800">
                    승인 후 케이스 상태가 진단 확정으로 변경됩니다.
                  </div>
                )}

                {errorMsg && <p className="text-xs font-medium text-rose-600">{errorMsg}</p>}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-4">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  autoFocus={!isEdit}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                    isEdit ? "bg-rose-600 hover:bg-rose-700" : "bg-teal-600 hover:bg-teal-700"
                  }`}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "수정 확정" : "승인"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => openForm("confirm")}
          disabled={submitting}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-teal-200 bg-white px-2.5 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 disabled:opacity-40"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> 승인
        </button>
        <button
          type="button"
          onClick={() => openForm("edit")}
          disabled={submitting}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40"
        >
          <Pencil className="h-3.5 w-3.5" /> 수정
        </button>
      </div>
      {dialog}
    </>
  );
}
