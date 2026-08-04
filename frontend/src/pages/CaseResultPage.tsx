import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AlertCircle, Loader2, Printer, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getCase } from "../api/cases";
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
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Printer className="h-4 w-4" /> 인쇄·PDF 저장
            </button>
          ) : null}
        </div>
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

      {caseData.status === "confirmed" && getStoredItem("user_role") === "doctor" ? (
        <CaseReviewHistory caseId={caseData.id} />
      ) : null}

      {hasResult ? <PrintableReport caseData={caseData} /> : null}
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
