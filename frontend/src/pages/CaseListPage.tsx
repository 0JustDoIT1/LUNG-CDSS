import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Loader2, Layers, UploadCloud, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import type { CaseStatus, CaseListItem, CaseDetail } from "../types/case";
import { Th, MetricCard } from "../components/dashboard/shared";
import { CaseResultModal } from "../components/pathologist/CaseResultModal";
import { getCases, getCase, deleteCase } from "../api/cases";

const STATUS_LABELS_SIMPLE: Record<string, string> = {
  uploaded: "분석 대기",
  processing: "분석 중",
  completed: "분석 완료",
  failed: "분석 실패",
};

const STATUS_CLS_SIMPLE: Record<string, string> = {
  uploaded: "bg-orange-100 text-orange-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-rose-100 text-rose-700",
};

function formatDateNoSeconds(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CaseListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("");
  const [search, setSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [metrics, setMetrics] = useState({
    total: 0,
    uploaded: 0,
    completed: 0,
    failed: 0,
  });

  const [modalCase, setModalCase] = useState<CaseDetail | CaseListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getCases({
        page: currentPage,
        page_size: 10,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      });

      setCases(data.results);
      setTotalPages(data.total_pages);
      setTotalCount(data.count);
      setMetrics(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "케이스 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [currentPage, statusFilter, search]);

  useEffect(() => {
    // Fetching on query changes is the synchronization boundary for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCases();
  }, [fetchCases]);


  const openModal = useCallback(async (c: CaseListItem): Promise<void> => {
    setModalCase(c);
    setDetailLoading(true);
    try {
      const detail = await getCase(c.id);
      setModalCase(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeModal = (): void => setModalCase(null);

  const openedFromStateRef = useRef(false);

  useEffect(() => {
    const openCaseId = (location.state as { openCaseId?: string } | null)?.openCaseId;
    if (openCaseId && cases.length > 0 && !openedFromStateRef.current) {
      const target = cases.find((c) => c.id === openCaseId);
      if (target) {
        openedFromStateRef.current = true;
        // Navigation state intentionally opens the requested modal once.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        openModal(target);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, cases, openModal]);

  async function handleDelete(id: string, specimenId: string) {
    const confirmed = window.confirm(`"${specimenId}" 케이스를 삭제하시겠습니까?\n삭제된 슬라이드 및 결과는 복구할 수 없습니다.`);
    if (!confirmed) return;

    setDeletingId(id);
    try {
      await deleteCase(id);
      setCases((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error(e);
      alert("삭제 중 문제가 발생했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  if (initialLoading)
  return (
    <div className="relative space-y-5 animate-pulse">
      {/* 스피너 오버레이 */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/60">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
          <div className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-xs font-medium text-gray-400 tracking-wide">케이스 목록을 불러오는 중...</p>
      </div>

      {/* 헤더 스켈레톤 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="h-3 w-20 bg-gray-200 rounded mb-2" />
          <div className="h-7 w-32 bg-gray-200 rounded" />
        </div>
        <div className="h-10 w-36 bg-gray-200 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 h-[74px]">
            <div className="h-3 w-16 bg-gray-200 rounded mb-3" />
            <div className="h-6 w-10 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 w-64 bg-gray-200 rounded-lg" />
        <div className="h-9 flex-1 min-w-[160px] bg-gray-200 rounded-lg" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="bg-gray-50/80 h-10" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-t border-gray-100">
            <div className="h-3.5 w-24 bg-gray-200 rounded" />
            <div className="h-3.5 w-28 bg-gray-200 rounded" />
            <div className="h-3.5 w-12 bg-gray-200 rounded" />
            <div className="h-3.5 w-14 bg-gray-200 rounded" />
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
  if (error) return <div className="p-8 text-sm text-rose-600">에러: {error}</div>;

  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: "분석 대기" },
    { v: "completed", l: "분석 완료" },
    { v: "failed", l: "분석 실패" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
          <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">케이스 리스트</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate("/upload")}
          className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 transition"
        >
          + 새 케이스 업로드
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="총 케이스" value={metrics.total} icon={Layers} />
        <MetricCard label="업로드됨" value={metrics.uploaded} tone="orange" icon={UploadCloud} />
        <MetricCard label="분석 완료" value={metrics.completed} tone="teal" icon={CheckCircle2} />
        <MetricCard label="분석 실패" value={metrics.failed} tone={metrics.failed > 0 ? "rose" : "default"} icon={XCircle} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {statusFilters.map((s) => {
            const count = s.v === "" ? metrics.total : metrics[s.v as "uploaded" | "completed" | "failed"];
            const active = statusFilter === s.v;
          
            const activeColors: Record<string, string> = {
              "": "bg-gray-900 text-white",
              uploaded: "bg-orange-100 text-orange-700",
              completed: "bg-green-100 text-green-700",
              failed: "bg-rose-100 text-rose-700",
            };
          
            return (
              <button
                key={s.v || "all"}
                onClick={() => {
                  setStatusFilter(s.v);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active ? activeColors[s.v] : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <span>{s.l}</span>
                <span className={`tabular-nums ${
                  active 
                    ? (s.v === "" ? "text-white/70" : "opacity-60")
                    : "text-gray-400"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="검체 ID / 진단 검색..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400"
          />
        </div>
      </div>

      <div className="relative overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
              <p className="text-xs text-gray-500">불러오는 중...</p>
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 sticky top-0">
            <tr>
              <Th>검체 ID</Th>
              <Th>업로드일시</Th>
              <Th>분류</Th>
              <Th>정확도</Th>
              <Th>상태</Th>
              <Th>{null}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cases.map((c) => {
              const luad = c.luad_probability ?? 0;
              const lusc = c.lusc_probability ?? 0;
              const conf = c.luad_probability != null ? Math.max(luad, lusc) : null;
              return (
                <tr
                  key={c.id}
                  onClick={() => openModal(c)}
                  className="hover:bg-teal-50 hover:shadow-sm transition-all cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.specimen_id}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">
                    {c.uploaded_at ? formatDateNoSeconds(c.uploaded_at) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {c.prediction_label ? (
                      <span
                        className={`text-xs font-semibold ${
                          c.prediction_label === "LUAD" ? "text-indigo-600" : "text-teal-600"
                        }`}
                      >
                        {c.prediction_label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-600">
                    {conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS_SIMPLE[c.status]}`}>
                      {STATUS_LABELS_SIMPLE[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id, c.specimen_id)}
                      disabled={deletingId === c.id}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      aria-label="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {cases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  케이스가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            전체 {totalCount}건 · {currentPage}/{totalPages}페이지
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              이전
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-md text-xs font-medium transition ${
                  currentPage === page
                    ? "bg-teal-600 text-white"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {modalCase && (
        <CaseResultModal caseData={modalCase} loading={detailLoading} onClose={closeModal} />
      )}
    </div>
  );
}
