import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AlertCircle, CheckCircle2, Loader2, Printer, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getCase, releaseCase } from "../api/cases";
import Header from "../components/Shared/Header";
import { UnifiedCaseResultSections } from "../components/dashboard/UnifiedCaseResultSections";
import { CaseReviewHistory } from "../components/dashboard/CaseReviewHistory";
import { PrintableReport } from "../components/dashboard/PrintableReport";
import { STATUS_CLS, STATUS_LABELS, type CaseDetail } from "../types/case";
import { getStoredItem } from "../utils/storage";

interface CaseResultPageProps {
  standalone?: boolean;
}

function ResultContent(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);

  const loadCase = useCallback(async () => {
    if (!id) {
      setError("케이스 정보가 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    try {
      setCaseData(await getCase(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;

    if (!id) {
      queueMicrotask(() => {
        if (!active) return;
        setError("케이스 정보가 올바르지 않습니다.");
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    void getCase(id)
      .then((detail) => {
        if (!active) return;
        setCaseData(detail);
        setError(null);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "결과를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-gray-500">검사 결과를 불러오는 중입니다.</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-[45vh] flex flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-rose-50/50 px-5 text-center">
        <AlertCircle className="h-9 w-9 text-rose-500" />
        <div>
          <p className="font-semibold text-rose-800">검사 결과를 불러오지 못했습니다.</p>
          <p className="mt-1 text-sm text-rose-600">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadCase();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
        >
          <RefreshCw className="h-4 w-4" /> 다시 불러오기
        </button>
      </div>
    );
  }

  const hasResult = ["pending_review", "confirmed"].includes(caseData.status);
  const isDoctor = getStoredItem("user_role") === "doctor";
  const isReleased = Boolean(caseData.confirmed_finding?.released_at);

  async function handleRelease() {
    if (!id || releasing || isReleased) return;

    setReleasing(true);
    setReleaseError(null);
    try {
      setCaseData(await releaseCase(id));
      setReleaseConfirmOpen(false);
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : "결과를 전달하지 못했습니다.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="이전 화면으로 돌아가기"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-teal-600">AI 병리 분석 결과</p>
              <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-gray-900">
                {caseData.specimen_id}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{caseData.patient_name ?? "환자 정보 없음"}</span>
                <span aria-hidden="true">·</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_CLS[caseData.status]}`}>
                  {STATUS_LABELS[caseData.status]}
                </span>
                {caseData.completed_at ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(caseData.completed_at).toLocaleString("ko-KR")}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {hasResult ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {caseData.status === "confirmed" && isDoctor ? (
                isReleased ? (
                  <div className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:justify-start">
                    <CheckCircle2 className="h-4 w-4" />
                    환자 전달 완료
                    <span className="hidden font-normal text-emerald-600 lg:inline">
                      {new Date(caseData.confirmed_finding!.released_at!).toLocaleString("ko-KR")}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReleaseError(null);
                      setReleaseConfirmOpen(true);
                    }}
                    disabled={releasing}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {releasing ? "전달 중..." : "환자에게 결과 전달"}
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
              >
                <Printer className="h-4 w-4" /> 인쇄·PDF 저장
              </button>
            </div>
          ) : null}
        </div>
        {releaseError ? (
          <p className="mt-3 text-right text-sm text-rose-600" role="alert">{releaseError}</p>
        ) : null}
      </header>

      {hasResult ? (
        <UnifiedCaseResultSections caseData={caseData} />
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
          <p className="font-semibold text-amber-900">아직 표시할 분석 결과가 없습니다.</p>
          <p className="mt-1 text-sm text-amber-700">
            현재 상태는 ‘{STATUS_LABELS[caseData.status]}’입니다. 분석이 완료된 뒤 다시 확인해 주세요.
          </p>
        </section>
      )}

      {caseData.status === "confirmed" && isDoctor ? (
        <CaseReviewHistory caseId={caseData.id} />
      ) : null}

      {hasResult ? <PrintableReport caseData={caseData} /> : null}

      {releaseConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="release-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !releasing) setReleaseConfirmOpen(false);
          }}
        >
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/60 bg-white shadow-2xl">
            <div className="relative bg-gradient-to-br from-teal-50 via-white to-emerald-50 px-6 pb-5 pt-6">
              <button
                type="button"
                onClick={() => setReleaseConfirmOpen(false)}
                disabled={releasing}
                aria-label="전달 확인창 닫기"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/20">
                <Send className="h-5 w-5" />
              </div>
              <h2 id="release-dialog-title" className="text-xl font-semibold tracking-tight text-gray-900">
                환자에게 결과를 전달할까요?
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                확정된 검사 결과가 환자 앱에 공개되고 알림이 전송됩니다.
              </p>
            </div>

            <div className="px-6 py-5">
              <dl className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70 text-sm">
                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
                  <dt className="text-gray-500">환자</dt>
                  <dd className="font-semibold text-gray-900">{caseData.patient_name ?? "환자 정보 없음"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-gray-500">검체 ID</dt>
                  <dd className="font-mono font-semibold text-gray-900">{caseData.specimen_id}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-3">
                  <dt className="text-gray-500">최종 진단</dt>
                  <dd className="font-semibold text-teal-700">
                    {caseData.confirmed_finding?.final_subtype ?? "확정 소견 없음"}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs font-medium text-gray-500">환자에게 공개될 최종 소견</p>
                <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {caseData.confirmed_finding?.final_note?.trim() || "작성된 최종 소견이 없습니다."}
                </p>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>전달 후에는 같은 결과를 다시 전달할 수 없습니다. 환자 정보와 확정 소견을 확인해 주세요.</p>
              </div>

              {releaseError ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                  {releaseError}
                </p>
              ) : null}

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setReleaseConfirmOpen(false)}
                  disabled={releasing}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleRelease()}
                  disabled={releasing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {releasing ? "전달 중..." : "결과 전달하기"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CaseResultPage({ standalone = false }: CaseResultPageProps): React.JSX.Element {
  if (!standalone) return <ResultContent />;

  const highContrast = getStoredItem("dashboard_a11y_high_contrast") === "true";

  return (
    <div className={`min-h-screen bg-[#f7f8fa] ${highContrast ? "a11y-hc" : ""}`}>
      <Header />
      <main className="mx-auto w-full max-w-[1500px] p-4 lg:p-6">
        <ResultContent />
      </main>
    </div>
  );
}
