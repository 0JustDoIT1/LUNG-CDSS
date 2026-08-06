import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  AlertTriangle,
  Star,
  Users,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  GitCompare,
  ArrowUpDown,
  Minus,
  Plus,
  Contrast,
  CalendarDays,
  Clock3,
} from "lucide-react";
import type {
  CaseStatus,
  CaseListItem,
  Metrics,
} from "../types/case";
import { STATUS_LABELS } from "../types/case";
import { Th, MetricCard } from "../components/dashboard/shared";
import { ReviewActionCell } from "../components/dashboard/ReviewActionCell";
import { ConfidenceCompact } from "../components/dashboard/ConfidenceIndicator";
import { CompareModal } from "../components/dashboard/CompareModal";
import { DoctorStickyNote } from "../components/dashboard/DoctorStickyNote";
import Header from "../components/Shared/Header";
import apiClient from "../api/client";
import { getAllCases } from "../api/cases";
import { approveDoctorAppointment, getDoctorAppointments } from "../api/appointments";
import type { DoctorAppointment } from "../types/appointment";
import { getStoredItem, setStoredItem } from "../utils/storage";

const STATUS_DOT: Record<CaseStatus, string> = {
  uploaded: "bg-gray-400",
  processing: "bg-blue-500",
  pending_review: "bg-amber-500",
  confirmed: "bg-green-700",
  rejected: "bg-rose-600",
  failed: "bg-rose-500",
};

// ----------------------------- 접근성 설정 (글자 크기 / 고대비) -----------------------------
// 두 설정 모두 localStorage에 저장해 새로고침 후에도 유지됨.
// 글자 크기는 <html> 루트 font-size를 조정해 rem 기반 Tailwind 클래스 전체에 반영됨.
const FONT_SCALE_STORAGE_KEY = "dashboard_a11y_font_scale";
const HIGH_CONTRAST_STORAGE_KEY = "dashboard_a11y_high_contrast";
const FONT_SCALE_STEPS = [0.875, 1, 1.125, 1.25] as const;
const BASE_ROOT_FONT_PX = 16;
const CASE_REFRESH_INTERVAL_MS = 30_000;
const APPOINTMENT_REFRESH_INTERVAL_MS = 15_000;

const APPOINTMENT_STATUS_LABEL: Record<DoctorAppointment["status"], string> = {
  requested: "승인 대기",
  confirmed: "예약 확정",
  reminded_d7: "예약 확정",
  reminded_d1: "예약 확정",
  checked_in: "접수 완료",
  completed: "진료 완료",
  cancelled: "취소",
  rejected: "반려",
  time_proposed: "시간 제안",
  no_show: "미방문",
};

function appointmentDate(appointment: DoctorAppointment): Date {
  return new Date(appointment.confirmed_slot ?? appointment.requested_at_slot);
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function readStoredFontScale(): number {
  if (typeof window === "undefined") return 1;
  const saved = Number(getStoredItem(FONT_SCALE_STORAGE_KEY));
  return FONT_SCALE_STEPS.includes(saved as (typeof FONT_SCALE_STEPS)[number]) ? saved : 1;
}

function readStoredHighContrast(): boolean {
  if (typeof window === "undefined") return false;
  return getStoredItem(HIGH_CONTRAST_STORAGE_KEY) === "true";
}

interface AccessibilityControlsProps {
  fontScale: number;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
}

function AccessibilityControls({
  fontScale,
  onDecreaseFont,
  onIncreaseFont,
  highContrast,
  onToggleHighContrast,
}: AccessibilityControlsProps): React.JSX.Element {
  const atMin = FONT_SCALE_STEPS.indexOf(fontScale as (typeof FONT_SCALE_STEPS)[number]) <= 0;
  const atMax =
    FONT_SCALE_STEPS.indexOf(fontScale as (typeof FONT_SCALE_STEPS)[number]) >= FONT_SCALE_STEPS.length - 1;

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
        <button
          onClick={onDecreaseFont}
          disabled={atMin}
          aria-label="글자 크기 축소"
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="px-1 text-xs font-medium text-gray-500 tabular-nums w-9 text-center">
          {Math.round(fontScale * 100)}%
        </span>
        <button
          onClick={onIncreaseFont}
          disabled={atMax}
          aria-label="글자 크기 확대"
          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <button
        onClick={onToggleHighContrast}
        aria-pressed={highContrast}
        aria-label="고대비 모드 전환"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          highContrast
            ? "bg-gray-900 text-white border-gray-900"
            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        <Contrast className="w-3.5 h-3.5" />
        고대비
      </button>
    </div>
  );
}

function getConfidence(c: CaseListItem): number | null {
  if (c.luad_probability == null && c.lusc_probability == null) return null;
  return Math.max(c.luad_probability ?? 0, c.lusc_probability ?? 0);
}

// 긴급 케이스 판정: 완료됐지만 신뢰도가 낮은 경우(재검 권장 구간)
function isUrgentCase(c: CaseListItem): boolean {
  if (c.status !== "pending_review") return false;
  const conf = getConfidence(c);
  return conf != null && conf > 0 && conf < 0.7;
}

// 분석 실패로 재처리가 필요한 케이스 (긴급과는 별도로 구분)
function isReprocessNeeded(c: CaseListItem): boolean {
  return c.status === "failed";
}

// 긴급도 점수: 낮을수록 더 긴급 (신뢰도 오름차순)
function urgencyScore(c: CaseListItem): number {
  const conf = getConfidence(c);
  return conf ?? 1;
}

type SortMode = "upload" | "confidence" | "review";

const SORT_OPTIONS: { v: SortMode; l: string }[] = [
  { v: "upload", l: "업로드순" },
  { v: "confidence", l: "신뢰도 낮은순" },
  { v: "review", l: "리뷰 대기순" },
];

// ----------------------------- 사이드 패널 (xl 이상에서만 노출) -----------------------------

function SidebarSkeleton(): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-6 rounded-md bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}

interface LeftSidebarProps {
  statusFilters: { v: CaseStatus | ""; l: string }[];
  statusFilter: CaseStatus | "";
  setStatusFilter: (v: CaseStatus | "") => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (fn: (v: boolean) => boolean) => void;
  cases: CaseListItem[];
}

function LeftSidebar({
  statusFilters,
  statusFilter,
  setStatusFilter,
  favoritesOnly,
  setFavoritesOnly,
  cases,
}: LeftSidebarProps): React.JSX.Element {
  const favoriteCount = cases.filter((c) => c.is_favorite).length;

  return (
    <aside className="hidden xl:flex xl:flex-col xl:sticky xl:top-6 gap-4 shrink-0">
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
        <p className="px-1.5 pb-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide">상태</p>
        {statusFilters.map((s) => {
          const count = s.v === "" ? cases.length : cases.filter((c) => c.status === s.v).length;
          const active = statusFilter === s.v;
          return (
            <button
              key={s.v || "all"}
              onClick={() => setStatusFilter(s.v)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span>{s.l}</span>
              <span className={`tabular-nums ${active ? "text-white/70" : "text-gray-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            favoritesOnly ? "bg-amber-50 text-amber-700" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Star className={`w-3.5 h-3.5 ${favoritesOnly ? "fill-amber-400 text-amber-400" : ""}`} />
            즐겨찾기
          </span>
          <span className="tabular-nums text-gray-400">{favoriteCount}</span>
        </button>
      </div>
    </aside>
  );
}

interface RightSidebarProps {
  urgent: CaseListItem[];
  reviewPending: CaseListItem[];
  onOpen: (c: CaseListItem) => void;
}

function RightSidebar({ urgent, reviewPending, onOpen }: RightSidebarProps): React.JSX.Element {
  return (
    <aside className="hidden xl:flex xl:flex-col xl:sticky xl:top-6 gap-4 shrink-0">
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
          <AlertTriangle className="w-3 h-3 text-amber-500" /> 신뢰도 낮은 케이스
        </p>
        {urgent.length === 0 ? (
          <p className="text-xs text-gray-400 py-1.5">해당 케이스가 없습니다</p>
        ) : (
          <div className="space-y-0.5">
            {urgent.slice(0, 6).map((c) => {
              const conf = getConfidence(c);
              return (
                <button
                  key={c.id}
                  onClick={() => onOpen(c)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-amber-50/60 transition-colors"
                >
                  <span className="font-mono text-gray-700 truncate">{c.specimen_id}</span>
                  <span className="text-amber-600 tabular-nums shrink-0 ml-2">
                    {conf != null ? `${(conf * 100).toFixed(0)}%` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wide">
          <ClipboardCheck className="w-3 h-3 text-gray-400" /> 검토 대기
        </p>

        {reviewPending.length === 0 ? (
          <p className="text-xs text-gray-400 py-1.5">검토 대기 케이스가 없습니다</p>
        ) : (
          <div className="space-y-0.5">
            {reviewPending.slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-gray-50 transition-colors"
              >
                <span className="font-mono text-gray-700 truncate">{c.specimen_id}</span>
                <span className="text-gray-400 shrink-0 ml-2">{c.prediction_label ?? "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <DoctorStickyNote />
    </aside>
  );
}

// ----------------------------- 컴포넌트 -----------------------------
function TodaySchedule({
  appointments,
  loading,
  now,
  onOpenSchedule,
  onApprove,
  approvingId,
}: {
  appointments: DoctorAppointment[];
  loading: boolean;
  now: Date;
  onOpenSchedule: (appointmentId?: string) => void;
  onApprove: (appointmentId: string) => void;
  approvingId: string | null;
}): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<"all" | DoctorAppointment["status"]>("all");
  const [patientSearch, setPatientSearch] = useState("");
  const [hideCompleted, setHideCompleted] = useState(true);

  const todayAppointments = useMemo(
    () => appointments
      .filter((appointment) => appointment.status !== "cancelled")
      .filter((appointment) => isSameLocalDate(appointmentDate(appointment), now))
      .sort((left, right) => {
        const leftWaiting = left.status === "requested" ? 0 : 1;
        const rightWaiting = right.status === "requested" ? 0 : 1;
        return leftWaiting - rightWaiting || appointmentDate(left).getTime() - appointmentDate(right).getTime();
      }),
    [appointments, now],
  );

  const visibleAppointments = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    return todayAppointments.filter((appointment) => {
      if (statusFilter === "confirmed" && !["confirmed", "reminded_d7", "reminded_d1"].includes(appointment.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "confirmed" && appointment.status !== statusFilter) return false;
      if (hideCompleted && appointment.status === "completed") return false;
      return !query || appointment.patient_name.toLowerCase().includes(query);
    });
  }, [hideCompleted, patientSearch, statusFilter, todayAppointments]);

  const pendingCount = todayAppointments.filter((appointment) => appointment.status === "requested").length;
  const confirmedCount = todayAppointments.filter((appointment) =>
    ["confirmed", "reminded_d7", "reminded_d1"].includes(appointment.status)
  ).length;
  const completedCount = todayAppointments.filter((appointment) => appointment.status === "completed").length;
  const nextAppointment = [...todayAppointments]
    .filter((appointment) => !["completed", "no_show"].includes(appointment.status))
    .sort((left, right) => appointmentDate(left).getTime() - appointmentDate(right).getTime())
    .find((appointment) => appointmentDate(appointment).getTime() >= now.getTime());

  function remainingLabel(appointment: DoctorAppointment): string {
    const remainingMinutes = Math.max(0, Math.ceil((appointmentDate(appointment).getTime() - now.getTime()) / 60_000));
    if (remainingMinutes < 60) return `${remainingMinutes}분 후`;
    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    return minutes ? `${hours}시간 ${minutes}분 후` : `${hours}시간 후`;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">오늘의 진료 일정</h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenSchedule()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
        >
          일정 관리
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
            <p className="text-[11px] text-gray-500">오늘 예약</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{todayAppointments.length}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
            <p className="text-[11px] text-amber-700">승인 대기</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-800">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-2.5">
            <p className="text-[11px] text-teal-700">예약 확정</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-teal-800">{confirmedCount}</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
            <p className="text-[11px] text-blue-700">다음 진료</p>
            <p className="mt-1 truncate text-sm font-bold text-blue-900">
              {nextAppointment ? `${nextAppointment.patient_name} · ${remainingLabel(nextAppointment)}` : "예정 없음"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              placeholder="환자명 검색"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | DoctorAppointment["status"])}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 outline-none focus:border-teal-400"
          >
            <option value="all">전체 상태</option>
            <option value="requested">승인 대기</option>
            <option value="confirmed">예약 확정</option>
            <option value="checked_in">접수 완료</option>
            <option value="completed">진료 완료</option>
            <option value="no_show">미방문</option>
          </select>
          <button
            type="button"
            onClick={() => setHideCompleted((current) => !current)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
              hideCompleted
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            완료 일정 {hideCompleted ? "펼치기" : "접기"} ({completedCount})
          </button>
        </div>

        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : todayAppointments.length === 0 ? (
          <p className="py-5 text-center text-sm text-gray-400">오늘 예정된 진료가 없습니다.</p>
        ) : visibleAppointments.length === 0 ? (
          <p className="py-5 text-center text-sm text-gray-400">검색 조건에 맞는 일정이 없습니다.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleAppointments.map((appointment) => {
              const date = appointmentDate(appointment);
              const waiting = appointment.status === "requested";
              return (
                <article
                  key={appointment.id}
                  className={`rounded-xl border p-3.5 transition ${
                    waiting ? "border-amber-200 bg-amber-50/30" : "border-gray-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenSchedule(appointment.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="flex min-w-14 flex-col items-center rounded-lg bg-white px-2 py-2 text-gray-700 shadow-sm">
                      <Clock3 className="mb-1 h-3.5 w-3.5 text-teal-600" />
                      <span className="text-xs font-bold tabular-nums">
                        {date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{appointment.patient_name}</span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500">{appointment.department}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                      waiting ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"
                    }`}>
                      {APPOINTMENT_STATUS_LABEL[appointment.status]}
                    </span>
                  </button>
                  {waiting ? (
                    <button
                      type="button"
                      onClick={() => onApprove(appointment.id)}
                      disabled={approvingId !== null}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {approvingId === appointment.id ? "승인 처리 중..." : "예약 바로 승인"}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Dashboard(): React.JSX.Element {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [approvingAppointmentId, setApprovingAppointmentId] = useState<string | null>(null);
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("");
  const [search, setSearch] = useState<string>("");
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<SortMode>("upload");

  // 비교 모드
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // 접근성: 글자 크기 / 고대비 모드 (의사마다 선호가 달라 개인 설정으로 저장)
  const [fontScale, setFontScale] = useState<number>(readStoredFontScale);
  const [highContrast, setHighContrast] = useState<boolean>(readStoredHighContrast);

  // 키보드 네비게이션용 선택 상태
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    let active = true;

    async function loadCases(isInitial: boolean): Promise<void> {
      try {
        const allCases = await getAllCases();
        if (!active) return;
        setCases(allCases);
        setLastRefreshedAt(new Date());
        if (isInitial) setError(null);
      } catch (e) {
        if (active && isInitial) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active && isInitial) setLoading(false);
      }
    }

    void loadCases(true);
    const refreshTimer = window.setInterval(() => void loadCases(false), CASE_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAppointments(): Promise<void> {
      try {
        const data = await getDoctorAppointments();
        if (active) setAppointments(data);
      } catch (appointmentError) {
        console.error("Failed to load today's appointments", appointmentError);
      } finally {
        if (active) setAppointmentsLoading(false);
      }
    }

    void loadAppointments();
    const refreshTimer = window.setInterval(() => void loadAppointments(), APPOINTMENT_REFRESH_INTERVAL_MS);
    const refreshOnFocus = () => void loadAppointments();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  // 글자 크기: html 루트 font-size를 조정해 rem 기반 Tailwind 클래스 전체에 반영.
  // 대시보드를 벗어나도 유지되도록 document 레벨에 적용하고 localStorage에 저장.
  useEffect(() => {
    document.documentElement.style.fontSize = `${BASE_ROOT_FONT_PX * fontScale}px`;
    setStoredItem(FONT_SCALE_STORAGE_KEY, String(fontScale));
    return () => {
      // 컴포넌트가 언마운트되어도 사용자가 선택한 크기는 유지 (원복하지 않음)
    };
  }, [fontScale]);

  useEffect(() => {
    setStoredItem(HIGH_CONTRAST_STORAGE_KEY, String(highContrast));
  }, [highContrast]);

  const decreaseFont = useCallback(() => {
    setFontScale((prev) => {
      const idx = FONT_SCALE_STEPS.indexOf(prev as (typeof FONT_SCALE_STEPS)[number]);
      const nextIdx = Math.max((idx === -1 ? 1 : idx) - 1, 0);
      return FONT_SCALE_STEPS[nextIdx];
    });
  }, []);

  const increaseFont = useCallback(() => {
    setFontScale((prev) => {
      const idx = FONT_SCALE_STEPS.indexOf(prev as (typeof FONT_SCALE_STEPS)[number]);
      const nextIdx = Math.min((idx === -1 ? 1 : idx) + 1, FONT_SCALE_STEPS.length - 1);
      return FONT_SCALE_STEPS[nextIdx];
    });
  }, []);

  const toggleHighContrast = useCallback(() => setHighContrast((v) => !v), []);

  const metrics: Metrics = useMemo(() => {
    const completed = cases.filter((c) => c.status === "pending_review" || c.status === "confirmed").length;
    const failed = cases.filter((c) => c.status === "failed").length;
    const review = cases.filter((c) => c.status === "pending_review").length;
    return { total: cases.length, completed, failed, review };
  }, [cases]);

  const urgent = useMemo(
    () =>
      cases.filter((c) => {
        if (c.status !== "pending_review") return false;
        const conf = getConfidence(c);
        return conf != null && conf > 0 && conf < 0.7;
      }),
    [cases]
  );

  const reviewPending = useMemo(
    () => cases.filter((c) => c.status === "pending_review"),
    [cases]
  );

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (!statusFilter || c.status === statusFilter) &&
        (!favoritesOnly || c.is_favorite) &&
        (!q ||
          (c.specimen_id ?? "").toLowerCase().includes(q) ||
          (c.patient_name ?? "").toLowerCase().includes(q) ||
          (c.prediction_label ?? "").toLowerCase().includes(q))
    );
  }, [cases, statusFilter, search, favoritesOnly]);

  // 재처리 필요(분석 실패) 및 긴급(완료+저신뢰도) 케이스는 정렬 옵션과 무관하게 상단에 고정
  const filtered = useMemo(() => {
    const pinnedReprocess = baseFiltered.filter(isReprocessNeeded);
    const pinnedUrgent = baseFiltered
      .filter(isUrgentCase)
      .sort((a, b) => urgencyScore(a) - urgencyScore(b));
    const rest = baseFiltered.filter((c) => !isUrgentCase(c) && !isReprocessNeeded(c));

    let sortedRest = rest;
    if (sortMode === "confidence") {
      sortedRest = [...rest].sort((a, b) => {
        const ca = getConfidence(a);
        const cb = getConfidence(b);
        if (ca == null && cb == null) return 0;
        if (ca == null) return 1;
        if (cb == null) return -1;
        return ca - cb;
      });
    } else if (sortMode === "review") {
      sortedRest = [...rest].sort((a, b) => {
        const pa = a.status === "pending_review" ? 0 : 1;
        const pb = b.status === "pending_review" ? 0 : 1;
        return pa - pb;
      });
    }

    return [...pinnedReprocess, ...pinnedUrgent, ...sortedRest];
  }, [baseFiltered, sortMode]);

  const effectiveSelectedId =
    selectedId && filtered.some((c) => c.id === selectedId)
      ? selectedId
      : (filtered[0]?.id ?? null);

  const openResultPage = useCallback(
    (c: CaseListItem): void => {
      navigate(`/doctor-dashboard/cases/${c.id}`);
    },
    [navigate]
  );

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    // 낙관적 업데이트: 응답 기다리지 않고 먼저 화면 반영, 실패하면 되돌림
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, is_favorite: !c.is_favorite } : c)));
    try {
      const res = await apiClient.post<{ is_favorite: boolean }>(`/cases/${id}/favorite/`);
      setCases((prev) => prev.map((c) => (c.id === id ? { ...c, is_favorite: res.data.is_favorite } : c)));
    } catch (e) {
      console.error(e);
      setCases((prev) => prev.map((c) => (c.id === id ? { ...c, is_favorite: !c.is_favorite } : c)));
    }
  }, []);

  const handleReviewed = useCallback((caseId: string, nextStatus: "confirmed" | "rejected") => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, status: nextStatus, is_confirmed: nextStatus === "confirmed" } : c))
    );
  }, []);

  const approveAppointment = useCallback(async (appointmentId: string): Promise<void> => {
    setApprovingAppointmentId(appointmentId);
    setAppointmentMessage(null);
    try {
      const updated = await approveDoctorAppointment(appointmentId);
      setAppointments((current) => current.map((appointment) =>
        appointment.id === appointmentId ? updated : appointment
      ));
      setAppointmentMessage(`${updated.patient_name}님의 예약을 승인했습니다.`);
    } catch (approvalError) {
      console.error("Failed to approve appointment", approvalError);
      setAppointmentMessage("예약 승인에 실패했습니다. 예약 상태를 다시 확인해주세요.");
    } finally {
      setApprovingAppointmentId(null);
    }
  }, []);

  const moveSelection = useCallback(
    (dir: 1 | -1) => {
      if (filtered.length === 0) return;
      const idx = filtered.findIndex((c) => c.id === effectiveSelectedId);
      const nextIdx = idx === -1 ? 0 : Math.min(Math.max(idx + dir, 0), filtered.length - 1);
      const next = filtered[nextIdx];
      setSelectedId(next.id);
      rowRefs.current.get(next.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [effectiveSelectedId, filtered]
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

      const currentCase = filtered.find((c) => c.id === effectiveSelectedId) ?? null;

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
            openResultPage(currentCase);
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [effectiveSelectedId, filtered, moveSelection, openResultPage]);

  const statusFilters: { v: CaseStatus | ""; l: string }[] = [
    { v: "", l: "전체" },
    { v: "uploaded", l: STATUS_LABELS.uploaded },
    { v: "processing", l: STATUS_LABELS.processing },
    { v: "pending_review", l: STATUS_LABELS.pending_review },
    { v: "confirmed", l: STATUS_LABELS.confirmed },
    { v: "failed", l: STATUS_LABELS.failed },
  ];

  if (loading)
    return (
      <div className={`min-h-screen bg-[#F7F8FA] ${highContrast ? "a11y-hc" : ""}`}>
        <Header />
        <div className="mx-auto w-full max-w-[1760px] p-4 lg:p-6 xl:grid xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:gap-5 xl:items-start">
          <div className="hidden xl:flex xl:flex-col gap-4">
            <SidebarSkeleton />
          </div>

          <main className="space-y-5 min-w-0">
            {/* 헤더 자리 */}
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div className="space-y-2">
                <div className="h-3 w-20 rounded-full bg-gray-200 animate-pulse" />
                <div className="h-6 w-40 rounded-lg bg-gray-200 animate-pulse" />
              </div>
            </div>

            {/* 요약 카드 자리 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 space-y-2.5">
                  <div className="h-2.5 w-16 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-6 w-12 rounded-md bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>

            {/* 중앙 로딩 인디케이터 */}
            <div className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl border border-gray-200 bg-white">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
                <div className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent animate-spin" />
              </div>
              <p className="text-xs font-medium text-gray-400 tracking-wide">케이스 목록을 불러오는 중...</p>
            </div>

            {/* 테이블 행 자리 */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100 last:border-b-0">
                  <div className="h-3 w-24 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-3 w-16 rounded-full bg-gray-100 animate-pulse" />
                  <div className="h-3 w-20 rounded-full bg-gray-100 animate-pulse ml-auto" />
                  <div className="h-6 w-20 rounded-md bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </main>

          <div className="hidden xl:flex xl:flex-col gap-4">
            <SidebarSkeleton />
          </div>
        </div>
      </div>
    );

  if (error) return <div className="p-8 text-sm text-rose-600">에러: {error}</div>;

  return (
    <div className={`min-h-screen bg-[#F7F8FA] ${highContrast ? "a11y-hc" : ""}`}>
      <Header />
      <div className="mx-auto w-full max-w-[1760px] p-4 lg:p-6 xl:grid xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:gap-5 xl:items-start">
        <LeftSidebar
          statusFilters={statusFilters}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          cases={cases}
        />

        <main className="space-y-5 min-w-0">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
              <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">의사 대시보드</h1>
            </div>
            <div className="flex flex-col items-end gap-2">
              <AccessibilityControls
                fontScale={fontScale}
                onDecreaseFont={decreaseFont}
                onIncreaseFont={increaseFont}
                highContrast={highContrast}
                onToggleHighContrast={toggleHighContrast}
              />
              <div className="flex flex-col items-end gap-1">
                <p className="text-sm font-semibold text-gray-700 tabular-nums">
                  {now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </p>
                <p
                  className="flex items-center gap-1.5 text-[11px] text-gray-400"
                  title={lastRefreshedAt ? `마지막 갱신 ${lastRefreshedAt.toLocaleTimeString("ko-KR")}` : undefined}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  {lastRefreshedAt ? "자동 갱신됨" : "데이터 연결 중"}
                </p>
                <p className="text-[11px] text-gray-400">
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">J</kbd>/
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">K</kbd> 이동 ·{" "}
                  <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-white">Enter</kbd> 결과 화면 열기
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="총 케이스" value={metrics.total} icon={Users} />
            <MetricCard label="분석 완료" value={metrics.completed} tone="teal" icon={CheckCircle2} />
            <MetricCard label="실패" value={metrics.failed} tone={metrics.failed > 0 ? "rose" : "default"} icon={XCircle} />
            <MetricCard label="검토 필요" value={metrics.review} tone={metrics.review > 0 ? "amber" : "default"} icon={ClipboardCheck} />
          </div>

          {appointmentMessage ? (
            <p className={`rounded-lg px-4 py-2.5 text-sm ${
              appointmentMessage.includes("실패")
                ? "bg-rose-50 text-rose-700"
                : "bg-teal-50 text-teal-700"
            }`}>
              {appointmentMessage}
            </p>
          ) : null}

          <TodaySchedule
            appointments={appointments}
            loading={appointmentsLoading}
            now={now}
            onOpenSchedule={(appointmentId) => navigate(
              appointmentId
                ? `/doctor-dashboard/schedule?appointment=${encodeURIComponent(appointmentId)}`
                : "/doctor-dashboard/schedule",
            )}
            onApprove={(appointmentId) => void approveAppointment(appointmentId)}
            approvingId={approvingAppointmentId}
          />

          {urgent.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-3 w-3 text-amber-700" />
              </div>
              <p className="text-sm text-amber-900">
                <span className="font-medium">신뢰도 낮은 케이스 <span className="tabular-nums">{urgent.length}</span>건</span>
                <span className="text-amber-700">
                  {" "}
                  — {urgent.slice(0, 3).map((c) => c.specimen_id).join(", ")}
                  {urgent.length > 3 ? " 외" : ""} 확인이 필요합니다 (재검 권장)
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 xl:hidden">
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
                placeholder="검체 ID / 환자명 / 진단 검색..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400"
              />
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
              <span className="flex items-center gap-1 pl-2 pr-1 text-[11px] font-medium text-gray-400">
                <ArrowUpDown className="w-3 h-3" />
                정렬
              </span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setSortMode(opt.v)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    sortMode === opt.v ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 sticky top-0">
                <tr>
                  <Th>{null}</Th>
                  <Th>{null}</Th>
                  <Th>검체 ID</Th>
                  <Th>환자명</Th>
                  <Th>상태</Th>
                  <Th>진단 / 신뢰도</Th>
                  <Th className="hidden lg:table-cell">진행상황</Th>
                  <Th className="hidden xl:table-cell">업로드</Th>
                  <Th>액션</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const conf = getConfidence(c);
                  const isSelected = c.id === effectiveSelectedId;
                  const isCompareChecked = compareIds.includes(c.id);
                  const isUrgent = isUrgentCase(c);
                  const isReprocess = isReprocessNeeded(c);
                  return (
                    <tr
                      key={c.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(c.id, el);
                        else rowRefs.current.delete(c.id);
                      }}
                      onClick={() => openResultPage(c)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-teal-50/70"
                          : isReprocess
                          ? "bg-gray-50 hover:bg-gray-100/80"
                          : isUrgent
                          ? "bg-rose-50/50 hover:bg-rose-50/80"
                          : "hover:bg-gray-50/60"
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
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleFavorite(c.id)}
                          aria-label={c.is_favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          className="p-1 rounded-md hover:bg-amber-50 transition-colors"
                        >
                          <Star
                            className={`w-4 h-4 transition-colors ${
                              c.is_favorite ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        <span className={`inline-block w-1 h-4 rounded-full mr-2 align-middle ${isSelected ? "bg-teal-500" : isReprocess ? "bg-gray-400" : isUrgent ? "bg-rose-400" : "bg-transparent"}`} />
                        {c.specimen_id}
                        {isReprocess && (
                          <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-600 align-middle">
                            <XCircle className="w-2.5 h-2.5" />
                            재처리 필요
                          </span>
                        )}
                        {isUrgent && (
                          <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 text-rose-700 align-middle">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            긴급
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-700">
                        {c.patient_name || "-"}
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
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {c.status === "pending_review" ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            대기
                          </span>
                        ) : c.status === "confirmed" || c.is_confirmed ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                            확정
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-400 text-xs tabular-nums xl:table-cell">
                        {c.uploaded_at ? `${c.uploaded_at.slice(0, 10)} ${c.uploaded_at.slice(11, 16)}` : "—"}
                      </td>
                      <td className="px-4 py-3 relative">
                          <div className="flex gap-1.5 flex-wrap items-start" onClick={(e) => e.stopPropagation()}>
                            <ReviewActionCell
                              caseId={c.id}
                              status={c.status}
                              onReviewed={handleReviewed}
                            />
                          </div>
                        </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
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
              <span className="tabular-nums">90%↑</span> 확정 권장
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="tabular-nums">70~90%</span> 참고용
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="tabular-nums">&lt;70%</span> 재검 권장
            </span>
          </div>
        </main>

        <RightSidebar urgent={urgent} reviewPending={reviewPending} onOpen={openResultPage} />
      </div>

      {compareIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-gray-200 bg-white shadow-lg px-4 py-2.5 z-40">
          <span className="text-xs text-gray-500">
            <span className="tabular-nums">{compareIds.length}</span>개 선택됨{compareIds.length < 2 ? " · 1개 더 선택하세요" : ""}
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
    </div>
  );
}
