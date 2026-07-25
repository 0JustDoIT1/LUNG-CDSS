import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Grid3x3,
  ClipboardList,
  ScanSearch,
  X,
  AlertTriangle,
  Loader2,
  type LucideIcon,
} from "lucide-react";

// ----------------------------- 설정 -----------------------------
const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://lung-cdss.kro.kr/api";

// localStorage 토큰 키 — 로그인 페이지에서 같은 키로 저장해두기
const TOKEN_KEY = "access_token";

// ----------------------------- 타입 정의 -----------------------------
type CaseStatus = "uploaded" | "processing" | "completed" | "failed";
type ReviewStatus = "pending" | "confirmed" | "rejected";
type PredictionLabel = "LUAD" | "LUSC" | null;
type GeneName = "TP53" | "KEAP1" | "KRAS";

interface NucleusPatch {
  id: string;
  original_url: string;
  overlay_url: string;
  nuclei_count: number;
  attention_rank: number;
}

interface GenePrediction {
  gene_name: GeneName;
  likelihood: number;
}

/** GET /cases/ 목록 응답 (CaseListSerializer 기준) */
interface CaseListItem {
  id: string;
  specimen_id: string;
  status: CaseStatus;
  review_status: ReviewStatus | null;
  prediction_label: PredictionLabel;
  luad_probability: number | null;
  lusc_probability: number | null;
  uploaded_at: string;
  completed_at: string | null;
  // 그 외 필드는 optional
  [key: string]: unknown;
}

/** GET /cases/:id/ 상세 응답 (CaseDetailSerializer 기준) */
interface CaseDetail extends CaseListItem {
  current_step: string | null;
  nuclei_density_score: number | null;
  nuclei_density_level: string | null;
  nuclei_irregularity_score: number | null;
  nuclei_irregularity_level: string | null;
  heatmap_url: string | null;
  slide_thumbnail_url: string | null;
  nuclei_patches: NucleusPatch[];
  gene_predictions: GenePrediction[];
  treatment_note: string | null;
  analyzed_at: string | null;
}

type ModalType = "heatmap" | "summary" | "nucleus";

interface Metrics {
  total: number;
  completed: number;
  failed: number;
  review: number;
}

// ----------------------------- 매핑 -----------------------------
const STATUS_LABELS: Record<CaseStatus, string> = {
  uploaded: "업로드됨",
  processing: "분석 중",
  completed: "분석 완료",
  failed: "실패",
};

const STATUS_CLS: Record<CaseStatus, string> = {
  uploaded: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-rose-100 text-rose-700",
};

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: "대기",
  confirmed: "승인",
  rejected: "미승인",
};

const REVIEW_CLS: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-teal-100 text-teal-700",
  rejected: "bg-rose-100 text-rose-700",
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

/** 케이스 목록 응답이 배열일 수도, { results: [...] } 일 수도 있어 정규화 */
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

  // 모달
  const [modalCase, setModalCase] = useState<CaseDetail | CaseListItem | null>(null);
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // 1) 케이스 목록 로드
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

  // 2) 메트릭
  const metrics: Metrics = useMemo(() => {
    const completed = cases.filter((c) => c.status === "completed").length;
    const failed = cases.filter((c) => c.status === "failed").length;
    const review = cases.filter((c) => c.review_status === "pending").length;
    return { total: cases.length, completed, failed, review };
  }, [cases]);

  // 3) 정확도 낮은 케이스 (긴급 배너용)
  const urgent = useMemo(
    () =>
      cases.filter((c) => {
        if (c.status !== "completed") return false;
        const conf = Math.max(c.luad_probability ?? 0, c.lusc_probability ?? 0);
        return conf > 0 && conf < 0.6;
      }),
    [cases]
  );

  // 4) 필터링
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

  // 5) 상세 모달 열기 (signed URL은 60분만 유효하므로 열 때마다 새로 fetch)
  const openModal = useCallback(async (c: CaseListItem, type: ModalType): Promise<void> => {
    setModalType(type);
    setModalCase(c); // 일단 목록 데이터 먼저 보여주고
    setDetailLoading(true);
    try {
      const detail = await apiGet<CaseDetail>(`/cases/${c.id}/`);
      setModalCase(detail);
    } catch (e) {
      // 상세 실패해도 목록 데이터로 모달은 열어둠
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeModal = (): void => {
    setModalCase(null);
    setModalType(null);
  };

  // ----------------------------- 로딩/에러 -----------------------------
  if (loading)
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
      </div>
    );
  if (error) return <div className="p-8 text-rose-600">에러: {error}</div>;

  // ----------------------------- 렌더 -----------------------------
  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: STATUS_LABELS.uploaded },
    { v: "processing", l: STATUS_LABELS.processing },
    { v: "completed", l: STATUS_LABELS.completed },
    { v: "failed", l: STATUS_LABELS.failed },
  ];

  return (
    <main className="flex-1 p-3 lg:p-4 space-y-4 min-w-0 max-w-[1380px] mx-auto w-full">
      {/* 타이틀 */}
      <div>
        <p className="text-xs text-gray-500">진단 워크플로우</p>
        <h1 className="font-bold text-2xl text-gray-900">의사 대시보드</h1>
      </div>

      {/* 메트릭 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricCard label="총 케이스" value={metrics.total} />
        <MetricCard label="분석 완료" value={metrics.completed} tone="teal" />
        <MetricCard
          label="실패"
          value={metrics.failed}
          tone={metrics.failed > 0 ? "rose" : "default"}
        />
        <MetricCard
          label="검토 필요"
          value={metrics.review}
          tone={metrics.review > 0 ? "amber" : "default"}
        />
      </div>

      {/* 긴급 배너 */}
      {urgent.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800">
            ⚠ 정확도 낮은 케이스 {urgent.length}건:{" "}
            {urgent
              .slice(0, 3)
              .map((c) => c.specimen_id)
              .join(", ")}
            {urgent.length > 3 ? " 외" : ""} — 확인 필요
          </span>
        </div>
      )}

      {/* 필터 + 검색 */}
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

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <Th>Specimen ID</Th>
              <Th>상태</Th>
              <Th>진단</Th>
              <Th>리뷰</Th>
              <Th>정확도</Th>
              <Th>업로드</Th>
              <Th>액션</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => {
              const conf =
                c.luad_probability != null
                  ? Math.max(c.luad_probability, c.lusc_probability ?? 0)
                  : null;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                    {c.specimen_id}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_CLS[c.status] ?? ""
                      }`}
                    >
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {c.prediction_label ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.review_status ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          REVIEW_CLS[c.review_status] ?? ""
                        }`}
                      >
                        {REVIEW_LABELS[c.review_status] ?? c.review_status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {conf != null ? `${(conf * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {c.uploaded_at?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      <ActionBtn
                        icon={Grid3x3}
                        label="히트맵"
                        onClick={() => openModal(c, "heatmap")}
                      />
                      <ActionBtn
                        icon={ClipboardList}
                        label="요약"
                        onClick={() => openModal(c, "summary")}
                      />
                      <ActionBtn
                        icon={ScanSearch}
                        label="핵형태"
                        onClick={() => openModal(c, "nucleus")}
                      />
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

      {/* 모달 */}
      {modalCase && modalType && (
        <DetailModal
          caseData={modalCase}
          type={modalType}
          loading={detailLoading}
          onClose={closeModal}
        />
      )}
    </main>
  );
}

// ----------------------------- 서브 컴포넌트 -----------------------------
function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <th className="text-left px-4 py-2.5 font-semibold text-xs">{children}</th>
  );
}

type MetricTone = "default" | "teal" | "rose" | "amber";

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: MetricTone;
}): React.JSX.Element {
  const toneCls: Record<MetricTone, string> = {
    default: "border-gray-100 bg-white",
    teal: "border-teal-200 bg-teal-50",
    rose: "border-rose-200 bg-rose-50",
    amber: "border-amber-200 bg-amber-50",
  };
  const valueCls: Record<MetricTone, string> = {
    default: "text-gray-900",
    teal: "text-teal-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
  };
  return (
    <div className={`rounded-xl p-4 border ${toneCls[tone]}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueCls[tone]}`}>{value}</p>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-teal-50 text-teal-700 hover:bg-teal-100"
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

interface DetailModalProps {
  caseData: CaseDetail | CaseListItem;
  type: ModalType;
  loading: boolean;
  onClose: () => void;
}

function DetailModal({
  caseData,
  type,
  loading,
  onClose,
}: DetailModalProps): React.JSX.Element {
  const titles: Record<ModalType, string> = {
    heatmap: "히트맵",
    summary: "결과 요약",
    nucleus: "핵형태 분석",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg text-gray-900">{titles[type]}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="닫기"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          {caseData.specimen_id}
          {caseData.prediction_label ? ` — ${caseData.prediction_label}` : ""}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> 상세 로드 중...
          </div>
        )}

        {!loading && type === "heatmap" && (
          <HeatmapBody caseData={caseData as CaseDetail} />
        )}
        {!loading && type === "summary" && (
          <SummaryBody caseData={caseData as CaseDetail} />
        )}
        {!loading && type === "nucleus" && (
          <NucleusBody caseData={caseData as CaseDetail} />
        )}
      </div>
    </div>
  );
}

function HeatmapBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  if (!caseData.heatmap_url) {
    return <EmptyNote text="히트맵이 아직 생성되지 않았습니다." />;
  }
  return (
    <div className="space-y-3">
      <img
        src={caseData.heatmap_url}
        alt="히트맵"
        className="aspect-square w-full rounded-xl object-cover bg-teal-50"
      />
    </div>
  );
}

function SummaryBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const conf =
    caseData.luad_probability != null
      ? Math.max(caseData.luad_probability, caseData.lusc_probability ?? 0)
      : null;
  return (
    <div className="space-y-3 text-sm">
      <Row label="진단">
        <strong>{caseData.prediction_label ?? "—"}</strong>
      </Row>
      <Row label="LUAD 확률">
        {caseData.luad_probability != null
          ? `${(caseData.luad_probability * 100).toFixed(1)}%`
          : "—"}
      </Row>
      <Row label="LUSC 확률">
        {caseData.lusc_probability != null
          ? `${(caseData.lusc_probability * 100).toFixed(1)}%`
          : "—"}
      </Row>
      <Row label="최고 정확도">
        {conf != null ? `${(conf * 100).toFixed(1)}%` : "—"}
      </Row>

      {caseData.gene_predictions && caseData.gene_predictions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">유전자 변이 예측</p>
          <div className="space-y-1.5">
            {caseData.gene_predictions.map((g) => (
              <Row key={g.gene_name} label={g.gene_name}>
                {(g.likelihood * 100).toFixed(1)}%
              </Row>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 mb-1">표적치료 노트</p>
        <p className="text-gray-700 leading-relaxed">
          {caseData.treatment_note ?? "아직 생성된 노트가 없습니다."}
        </p>
      </div>
    </div>
  );
}

function NucleusBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const patches: NucleusPatch[] = caseData.nuclei_patches ?? [];
  if (patches.length === 0) {
    return <EmptyNote text="핵 패치 데이터가 없습니다." />;
  }
  return (
    <div className="space-y-3 text-sm">
      <Row label="핵 밀도">
        {caseData.nuclei_density_level ?? "—"}{" "}
        {caseData.nuclei_density_score != null
          ? `(${caseData.nuclei_density_score.toFixed(2)})`
          : ""}
      </Row>
      <Row label="핵 불규칙성">
        {caseData.nuclei_irregularity_level ?? "—"}{" "}
        {caseData.nuclei_irregularity_score != null
          ? `(${caseData.nuclei_irregularity_score.toFixed(2)})`
          : ""}
      </Row>
      <div className="mt-3">
        <p className="text-xs text-gray-500 mb-2">
          핵 패치 ({patches.length}개)
        </p>
        <div className="grid grid-cols-4 gap-2">
          {patches.slice(0, 8).map((p) => (
            <div
              key={p.id}
              className="aspect-square rounded-lg overflow-hidden bg-teal-50 relative"
            >
              <img
                src={p.overlay_url}
                alt={`패치 #${p.attention_rank}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 text-white px-1 rounded">
                #{p.attention_rank ?? "—"} · {p.nuclei_count}개
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900">{children}</span>
    </div>
  );
}

function EmptyNote({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="rounded-xl p-4 bg-gray-50 text-sm text-gray-400 text-center">
      {text}
    </div>
  );
}