import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { reviewCase } from "../../api/cases";
import type { CaseStatus } from "../../types/case";

interface ReviewActionCellProps {
  caseId: string;
  status: CaseStatus;
  onReviewed: (caseId: string, status: "confirmed" | "rejected") => void;
}

export function ReviewActionCell({
  caseId,
  status,
  onReviewed,
}: ReviewActionCellProps): React.JSX.Element | null {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_review") return null;

  async function submitConfirm(): Promise<void> {
    setSubmitting("confirm");
    setError(null);
    try {
      await reviewCase(caseId, { action: "confirm" });
      onReviewed(caseId, "confirmed");
    } catch (e) {
      console.error(e);
      setError("승인 처리에 실패했습니다.");
    } finally {
      setSubmitting(null);
    }
  }

  async function submitReject(): Promise<void> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("미승인 이유를 입력해주세요.");
      return;
    }

    setSubmitting("reject");
    setError(null);
    try {
      await reviewCase(caseId, { action: "reject", final_note: trimmedReason });
      onReviewed(caseId, "rejected");
      setReason("");
      setShowReason(false);
    } catch (e) {
      console.error(e);
      setError("미승인 처리에 실패했습니다.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="min-w-[260px] space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submitConfirm()}
          disabled={submitting !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {submitting === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          승인
        </button>
        <button
          type="button"
          onClick={() => {
            setShowReason((visible) => !visible);
            setError(null);
          }}
          disabled={submitting !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" /> 미승인
        </button>
      </div>

      {showReason ? (
        <div className="space-y-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3">
          <label className="block text-xs font-medium text-gray-700" htmlFor={`rejection-reason-${caseId}`}>
            미승인 이유 <span className="text-rose-600">*</span>
          </label>
          <textarea
            id={`rejection-reason-${caseId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="미승인 이유를 입력해주세요."
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-gray-400">{reason.length}/1000</span>
            <button
              type="button"
              onClick={() => void submitReject()}
              disabled={submitting !== null || !reason.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {submitting === "reject" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              미승인 확정
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
