import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  GitCompare,
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
import { ConfidenceCompact } from "../components/dashboard/ConfidenceIndicator";
import { CompareModal } from "../components/dashboard/CompareModal";
import apiClient from "../api/client";

const STATUS_DOT: Record<CaseStatus, string> = {
  uploaded: "bg-gray-400",
  processing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-rose-500",
};

function normalizeCases(data: unknown): CaseListItem[] {
  if (Array.isArray(data)) return data as CaseListItem[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: CaseListItem[] }).results;
  }
  return [];
}

function getConfidence(c: CaseListItem): number | null {
  if (c.luad_probability == null && c.lusc_probability == null) return null;
  return Math.max(c.luad_probability ?? 0, c.lusc_probability ?? 0);
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

  // 비교 모드
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // 키보드 네비게이션용 선택 상태
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const modalTypeRef = useRef<ModalType | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  modalTypeRef.current = modalType;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiClient.get<unknown>("/cases/");
        if (active) setCases(normalizeCases(res.data));
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
        const conf = getConfidence(c);
        return conf != null && conf > 0 && conf < 0.7;
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

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const openModal = useCallback(async (c: CaseListItem, type: ModalType): Promise<void> => {
    setModalType(type);
    setModalCase(c);
    setDetailLoading(true);
    try {
      const res = await apiClient.get<CaseDetail>(`/cases/${c.id}/`);
      setModalCase(res.data);
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

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }, []);

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      if (filtered.length === 0) return;
      const idx = filtered.findIndex((c) => c.id === selectedIdRef.current);
      const nextIdx = idx === -1 ? 0 : Math.min(Math.max(idx + dir, 0), filtered.length - 1);
      const next = filtered[nextIdx];
      setSelectedId(next.id);
      rowRefs.current.get(next.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [filtered]
  );

  // ----------------------------- 키보드 단축키 -----------------------------
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      const tag = (el as HTMLElement)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA";
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }

      const currentType = modalTypeRef.current;
      const currentCase = filtered.find((c) => c.id === selectedIdRef.current) ?? null;

      if (currentType) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
        } else if ((e.key === "h" || e.key === "H") && currentCase) {
          e.preventDefault();
          openModal(currentCase, "heatmap");
        } else if ((e.key === "s" || e.key === "S") && currentCase) {
          e.preventDefault();
          openModal(currentCase, "summary");
        } else if ((e.key === "n" || e.key === "N") && currentCase) {
          e.preventDefault();
          openModal(currentCase, "nucleus");
        }
        return;
      }

      switch (e.key) {
        case "j":
        case "J":
        case " ":
          e.preventDefault();
          moveSelection(1);
          break;
        case "k":
        case "K":
          e.preventDefault();
          moveSelection(-1);
          break;
        case "Enter":
          if (currentCase) {
            e.preventDefault();
            openModal(currentCase, "summary");
          }
          break;
        case "h":
        case "H":
          if (currentCase) {
            e.preventDefault();
            openModal(currentCase, "heatmap");
          }
          break;
        case "s":
        case "S":
          if (currentCase) {
            e.preventDefault();
            openModal(currentCase, "summary");
          }
          break;
        case "n":
        case "N":
          if (currentCase) {
            e.preventDefault();
            openModal(currentCase, "nucleus");
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, moveSelection, openModal]);

  if (loading)
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
      </div>
    );
  if (error) return <div className="p-8 text-sm text-rose-600">에러: {error}</div>;

  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: STATUS_LABELS.uploaded },
    { v: "processing", l: STATUS_LABELS.processing },
    { v: "completed", l: STATUS_LABELS.completed },
    { v: "failed", l: STATUS_LABELS.failed },
  ];

  return (
    <main className="flex-1 bg-[#F7F8FA] min-h-screen p-4 lg:p-6 space-y-5 min-w-0 max-w-[1380px] mx-auto w-full">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
          <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">의사 대시보드</h1>
        </div>
        <p className="text-[11px] text-gray-400">
          <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">J</kbd>/
          <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">K</kbd> 이동 ·{" "}
          <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">Enter</kbd> 상세 ·{" "}
          <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">H/S/N</kbd> 탭 전환 ·{" "}
          <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">Esc</kbd> 닫기
        </p>
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
              {urgent.length > 3 ? " 외" : ""} 확인이 필요합니다 (재검 권장)
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
                statusFilter === s.v ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
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
              <Th>{null}</Th>
              <Th>Specimen ID</Th>
              <Th>상태</Th>
              <Th>진단 / 신뢰도</Th>
              <Th>진행상황</Th>
              <Th>업로드</Th>
              <Th>액션</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => {
              const conf = getConfidence(c);
              const isSelected = c.id === selectedId;
              const isCompareChecked = compareIds.includes(c.id);
              return (
                <tr
                  key={c.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(c.id, el);
                    else rowRefs.current.delete(c.id);
                  }}
                  onClick={() => setSelectedId(c.id)}
                  className={`transition-colors cursor-pointer ${
                    isSelected ? "bg-teal-50/70" : "hover:bg-gray-50/60"
                  }`}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isCompareChecked}
                      disabled={!isCompareChecked && compareIds.length >= 2}
                      onChange={() => toggleCompare(c.id)}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-400 disabled:opacity-30"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    <span className={`inline-block w-1 h-4 rounded-full mr-2 align-middle ${isSelected ? "bg-teal-500" : "bg-transparent"}`} />
                    {c.specimen_id}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceCompact
                      label={c.prediction_label}
                      confidence={conf}
                      luadProbability={c.luad_probability}
                      luscProbability={c.lusc_probability}
                    />
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
                    <div className="flex gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  조건에 맞는 케이스가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-500 px-1">
        <span className="font-medium text-gray-600">신뢰도 구간:</span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          90%↑ 확정 권장
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          70~90% 참고용
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          &lt;70% 재검 권장
        </span>
      </div>

      {modalCase && modalType && (
        <DetailModal caseData={modalCase} type={modalType} loading={detailLoading} onClose={closeModal} />
      )}

      {compareIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-gray-200 bg-white shadow-lg px-4 py-2.5 z-40">
          <span className="text-xs text-gray-500">
            {compareIds.length}개 선택됨{compareIds.length < 2 ? " · 1개 더 선택하세요" : ""}
          </span>
          <button
            onClick={() => setShowCompare(true)}
            disabled={compareIds.length !== 2}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <GitCompare className="w-3.5 h-3.5" />
            비교하기
          </button>
          <button onClick={() => setCompareIds([])} className="text-xs text-gray-400 hover:text-gray-600">
            선택 해제
          </button>
        </div>
      )}

      {showCompare && compareIds.length === 2 && (
        <CompareModal caseIdA={compareIds[0]} caseIdB={compareIds[1]} onClose={() => setShowCompare(false)} />
      )}
    </main>
  );
}