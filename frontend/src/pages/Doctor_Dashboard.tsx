import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Grid3x3,
  ClipboardList,
  ScanSearch,
  AlertTriangle,
  Loader2,
  Users,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
} from "lucide-react";
import type {
  CaseStatus,
  CaseListItem,
  CaseDetail,
  ModalType,
  Metrics,
} from "../types/case";
import { STATUS_LABELS, REVIEW_LABELS, REVIEW_CLS } from "../types/case";
import { Th, MetricCard, ActionBtn } from "../components/dashboard/shared";
import { DetailModal } from "../components/dashboard/DetailModal";

// ----------------------------- 설정 -----------------------------
const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://lung-cdss.kro.kr/api";

const TOKEN_KEY = "access_token";

// 상태별 점(dot) 색상 — 대시보드 전용 시각 표기
const STATUS_DOT: Record<CaseStatus, string> = {
  uploaded: "bg-gray-400",
  processing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-rose-500",
};

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
      <div className="p-8 flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
      </div>
    );
  if (error)
    return (
      <div className="p-8 text-sm text-rose-600">에러: {error}</div>
    );

  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: STATUS_LABELS.uploaded },
    { v: "processing", l: STATUS_LABELS.processing },
    { v: "completed", l: STATUS_LABELS.completed },
    { v: "failed", l: STATUS_LABELS.failed },
  ];

  return (
    <main className="flex-1 bg-[#F7F8FA] min-h-screen p-4 lg:p-6 space-y-5 min-w-0 max-w-[1380px] mx-auto w-full">
      <div>
        <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
        <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">의사 대시보드</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="총 케이스" value={metrics.total} icon={Users} />
        <MetricCard label="분석 완료" value={metrics.completed} tone="teal" icon={CheckCircle2} />
        <MetricCard label="실패" value={metrics.failed} tone={metrics.failed > 0 ? "rose" : "default"} icon={XCircle} />
        <MetricCard label="검토 필요" value={metrics.review} tone={metrics.review > 0 ? "amber" : "default"} icon={ClipboardCheck} />
      </div>

      {urgent.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-3 w-3 text-amber-700" />
          </div>
          <p className="text-sm text-amber-900">
            <span className="font-medium">신뢰도 낮은 케이스 {urgent.length}건</span>
            <span className="text-amber-700">
              {" "}
              — {urgent.slice(0, 3).map((c) => c.specimen_id).join(", ")}
              {urgent.length > 3 ? " 외" : ""} 확인이 필요합니다
            </span>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
          {statusFilters.map((s) => (
            <button
              key={s.v || "all"}
              onClick={() => setStatusFilter(s.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s.v
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="specimen_id / 진단 검색..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50/80 sticky top-0">
            <tr>
              <Th>Specimen ID</Th>
              <Th>상태</Th>
              <Th>진단 / 확률</Th>
              <Th>진행상황</Th>
              <Th>업로드</Th>
              <Th>액션</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => {
              const luad = c.luad_probability ?? 0;
              const lusc = c.lusc_probability ?? 0;
              const conf = c.luad_probability != null ? Math.max(luad, lusc) : null;
              return (
                <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.specimen_id}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {conf != null ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold w-11 ${
                            c.prediction_label === "LUAD" ? "text-indigo-600" : "text-teal-600"
                          }`}
                        >
                          {c.prediction_label ?? "—"}
                        </span>
                        <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full bg-indigo-500" style={{ width: `${luad * 100}%` }} />
                          <div className="h-full bg-teal-500" style={{ width: `${lusc * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-gray-400 w-9 text-right">
                          {(conf * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.review_status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REVIEW_CLS[c.review_status] ?? ""}`}>
                        {REVIEW_LABELS[c.review_status] ?? c.review_status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs tabular-nums">{c.uploaded_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
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
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  조건에 맞는 케이스가 없습니다
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