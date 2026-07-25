import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Grid3x3, ClipboardList, ScanSearch, AlertTriangle, Loader2 } from "lucide-react";
import type {
  CaseStatus,
  CaseListItem,
  CaseDetail,
  ModalType,
  Metrics,
} from "../types/case";
import { STATUS_LABELS, STATUS_CLS, REVIEW_LABELS, REVIEW_CLS } from "../types/case";
import { Th, MetricCard, ActionBtn } from "../components/dashboard/shared";
import { DetailModal } from "../components/dashboard/DetailModal";

// ----------------------------- 설정 -----------------------------
const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://lung-cdss.kro.kr/api";

const TOKEN_KEY = "access_token";

// ----------------------------- API -----------------------------
async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    throw new Error("인증 만료 — 다시 로그인하세요");
  }
  if (res.status === 403) {
    throw new Error("이 화면에 접근할 권한이 없습니다");
  }
  if (!res.ok) throw new Error(`API 에러 (${res.status})`);
  return (await res.json()) as T;
}

function normalizeCases(data: unknown): CaseListItem[] {
  if (Array.isArray(data)) return data as CaseListItem[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: CaseListItem[] }).results;
  }
  return [];
}

// ----------------------------- 컴포넌트 -----------------------------
export default function Dashboard(): React.JSX.Element {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("");
  const [search, setSearch] = useState<string>("");

  const [modalCase, setModalCase] = useState<CaseDetail | CaseListItem | null>(null);
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiGet<unknown>("/cases/");
        if (active) setCases(normalizeCases(data));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const metrics: Metrics = useMemo(() => {
    const completed = cases.filter((c) => c.status === "completed").length;
    const failed = cases.filter((c) => c.status === "failed").length;
    const review = cases.filter((c) => c.review_status === "pending").length;
    return { total: cases.length, completed, failed, review };
  }, [cases]);

  const urgent = useMemo(
    () =>
      cases.filter((c) => {
        if (c.status !== "completed") return false;
        const conf = Math.max(c.luad_probability ?? 0, c.lusc_probability ?? 0);
        return conf > 0 && conf < 0.6;
      }),
    [cases]
  );

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

  const openModal = useCallback(async (c: CaseListItem, type: ModalType): Promise<void> => {
    setModalType(type);
    setModalCase(c);
    setDetailLoading(true);
    try {
      const detail = await apiGet<CaseDetail>(`/cases/${c.id}/`);
      setModalCase(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeModal = (): void => {
    setModalCase(null);
    setModalType(null);
  };

  if (loading)
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
      </div>
    );
  if (error) return <div className="p-8 text-rose-600">에러: {error}</div>;

  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: STATUS_LABELS.uploaded },
    { v: "processing", l: STATUS_LABELS.processing },
    { v: "completed", l: STATUS_LABELS.completed },
    { v: "failed", l: STATUS_LABELS.failed },
  ];

  return (
    <main className="flex-1 p-3 lg:p-4 space-y-4 min-w-0 max-w-[1380px] mx-auto w-full">
      <div>
        <p className="text-xs text-gray-500">진단 워크플로우</p>
        <h1 className="font-bold text-2xl text-gray-900">의사 대시보드</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricCard label="총 케이스" value={metrics.total} />
        <MetricCard label="분석 완료" value={metrics.completed} tone="teal" />
        <MetricCard label="실패" value={metrics.failed} tone={metrics.failed > 0 ? "rose" : "default"} />
        <MetricCard label="검토 필요" value={metrics.review} tone={metrics.review > 0 ? "amber" : "default"} />
      </div>

      {urgent.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            ⚠ 신뢰도 낮은 케이스 {urgent.length}건:{" "}
            {urgent.slice(0, 3).map((c) => c.specimen_id).join(", ")}
            {urgent.length > 3 ? " 외" : ""} — 확인 필요
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {statusFilters.map((s) => (
          <button
            key={s.v || "all"}
            onClick={() => setStatusFilter(s.v)}
            className={`border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s.v
                ? "border-teal-600 bg-teal-50 text-teal-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.l}
          </button>
        ))}
        <div className="relative flex-1 min-w-[160px] ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="specimen_id / 진단 검색..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <Th>Specimen ID</Th>
              <Th>상태</Th>
              <Th>진단</Th>
              <Th>리뷰</Th>
              <Th>신뢰도</Th>
              <Th>업로드</Th>
              <Th>액션</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => {
              const conf = c.luad_probability != null ? Math.max(c.luad_probability, c.lusc_probability ?? 0) : null;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{c.specimen_id}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[c.status] ?? ""}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">{c.prediction_label ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.review_status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REVIEW_CLS[c.review_status] ?? ""}`}>
                        {REVIEW_LABELS[c.review_status] ?? c.review_status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{conf != null ? `${(conf * 100).toFixed(0)}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{c.uploaded_at?.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      <ActionBtn icon={Grid3x3} label="히트맵" onClick={() => openModal(c, "heatmap")} />
                      <ActionBtn icon={ClipboardList} label="요약" onClick={() => openModal(c, "summary")} />
                      <ActionBtn icon={ScanSearch} label="핵형태" onClick={() => openModal(c, "nucleus")} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  결과 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalCase && modalType && (
        <DetailModal caseData={modalCase} type={modalType} loading={detailLoading} onClose={closeModal} />
      )}
    </main>
  );
}