import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Loader2, Layers, UploadCloud, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import type { CaseStatus, CaseListItem, CaseDetail } from "../types/case";
import { Th, MetricCard } from "../components/dashboard/shared";
import { CaseResultModal } from "../components/pathologist/CaseResultModal";
import { getCases, getCase, deleteCase } from "../api/cases";
import { useNavigate } from "react-router-dom";

const STATUS_LABELS_SIMPLE: Record<string, string> = {
  uploaded: "업로드 완료",
  processing: "분석 중",
  completed: "분석 완료",
  failed: "분석 실패",
};

const STATUS_CLS_SIMPLE: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-600",
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
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("");
  const [search, setSearch] = useState<string>("");

  const [modalCase, setModalCase] = useState<CaseDetail | CaseListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCases();
      setCases(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "케이스 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const metrics = useMemo(() => {
    const uploaded = cases.filter((c) => c.status === "uploaded").length;
    const completed = cases.filter((c) => c.status === "completed").length;
    const failed = cases.filter((c) => c.status === "failed").length;
    return { total: cases.length, uploaded, completed, failed };
  }, [cases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (!statusFilter || c.status === statusFilter) &&
        (!q ||
          (c.specimen_id ?? "").toLowerCase().includes(q) ||
          (c.prediction_label ?? "").toLowerCase().includes(q))
    );
  }, [cases, statusFilter, search]);

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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  if (loading)
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-[#185fa5] animate-spin" />
        <p className="text-sm text-gray-500">불러오는 중...</p>
      </div>
    );
  if (error) return <div className="p-8 text-sm text-rose-600">에러: {error}</div>;

  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: "업로드 완료" },
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

      {/* 지표 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="총 케이스" value={metrics.total} icon={Layers} />
        <MetricCard label="업로드 완료" value={metrics.uploaded} tone="default" icon={UploadCloud} />
        <MetricCard label="분석 완료" value={metrics.completed} tone="teal" icon={CheckCircle2} />
        <MetricCard label="분석 실패" value={metrics.failed} tone={metrics.failed > 0 ? "rose" : "default"} icon={XCircle} />
      </div>

      {/* 상태 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {statusFilters.map((s) => {
            const count = s.v === "" ? cases.length : cases.filter((c) => c.status === s.v).length;
            const active = statusFilter === s.v;
            return (
              <button
                key={s.v || "all"}
                onClick={() => setStatusFilter(s.v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active ? "bg-teal-600 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <span>{s.l}</span>
                <span className={`tabular-nums ${active ? "text-white/70" : "text-gray-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검체 ID / 진단 검색..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
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
            {filtered.map((c) => {
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  케이스가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalCase && (
        <CaseResultModal caseData={modalCase} loading={detailLoading} onClose={closeModal} />
      )}
    </div>
  );
}