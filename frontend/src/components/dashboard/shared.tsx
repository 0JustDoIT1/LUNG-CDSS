import React from "react";
import type { LucideIcon } from "lucide-react";
import { Clock, Loader2, XCircle, ImageOff } from "lucide-react";
import type { CaseStatus } from "../../types/case";

export function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900">{children}</span>
    </div>
  );
}

export function EmptyNote({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="rounded-xl p-4 bg-gray-50 text-sm text-gray-400 text-center">
      {text}
    </div>
  );
}

/**
 * 케이스 상태에 따라 "아직 분석 전" / "분석 중" / "분석 실패" / "데이터 없음"을 구분해서 보여주는 공용 안내.
 * completed 상태인데 데이터가 비어있을 때만 fallbackText를 사용한다.
 */
export function AnalysisStatusNote({
  status,
  fallbackText,
}: {
  status: CaseStatus;
  fallbackText: string;
}): React.JSX.Element {
  if (status === "failed") {
    return (
      <div className="rounded-xl p-6 bg-rose-50 border border-rose-200 text-center flex flex-col items-center gap-2">
        <XCircle className="w-6 h-6 text-rose-500" />
        <p className="text-sm font-medium text-rose-700">분석에 실패했습니다.</p>
        <p className="text-xs text-rose-500">재분석을 시도하거나 담당자에게 문의해 주세요.</p>
      </div>
    );
  }
  if (status === "uploaded") {
    return (
      <div className="rounded-xl p-6 bg-gray-50 border border-gray-200 text-center flex flex-col items-center gap-2">
        <Clock className="w-6 h-6 text-gray-400" />
        <p className="text-sm font-medium text-gray-500">분석이 아직 진행되지 않았습니다.</p>
        <p className="text-xs text-gray-400">업로드만 완료된 상태입니다. 분석을 시작해 주세요.</p>
      </div>
    );
  }
  if (status === "processing") {
    return (
      <div className="rounded-xl p-6 bg-blue-50 border border-blue-200 text-center flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        <p className="text-sm font-medium text-blue-700">분석이 진행 중입니다.</p>
        <p className="text-xs text-blue-500">완료되면 이 화면에 결과가 표시됩니다.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-6 bg-gray-50 border border-gray-200 text-center flex flex-col items-center gap-2">
      <ImageOff className="w-6 h-6 text-gray-300" />
      <p className="text-sm text-gray-400">{fallbackText}</p>
    </div>
  );
}

/** 상세 모달 등에서 사용하는 꾸며진 로딩 스켈레톤 */
export function LoadingSkeleton({ label = "불러오는 중..." }: { label?: string }): React.JSX.Element {
  return (
    <div className="py-10 flex flex-col items-center justify-center gap-3">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-teal-100" />
        <div className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-xs font-medium text-gray-400 tracking-wide">{label}</p>
      <div className="w-full max-w-xs space-y-2 mt-1">
        <div className="h-2.5 rounded-full bg-gray-100 animate-pulse" />
        <div className="h-2.5 rounded-full bg-gray-100 animate-pulse w-4/5 mx-auto" />
      </div>
    </div>
  );
}

export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }): React.JSX.Element {
  return (
    <th className={`text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

type MetricTone = "default" | "teal" | "rose" | "amber" | "orange";

export function MetricCard({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: MetricTone;
  icon?: LucideIcon;
}): React.JSX.Element {
  const iconWrapCls: Record<MetricTone, string> = {
    default: "bg-gray-100 text-gray-500",
    teal: "bg-teal-50 text-teal-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    orange: "bg-orange-50 text-orange-600",
  };
  const valueCls: Record<MetricTone, string> = {
    default: "text-gray-900",
    teal: "text-teal-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
    orange: "text-orange-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {Icon && (
          <div className={`flex h-6 w-6 items-center justify-center rounded-md ${iconWrapCls[tone]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <p className={`text-2xl font-semibold mt-1.5 tabular-nums ${valueCls[tone]}`}>{value}</p>
    </div>
  );
}

export function ActionBtn({
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50/50 transition-colors cursor-pointer"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
