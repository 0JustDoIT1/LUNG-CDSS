import React from "react";
import type { LucideIcon } from "lucide-react";

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

export function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <th className="text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-gray-500">
      {children}
    </th>
  );
}

type MetricTone = "default" | "teal" | "rose" | "amber";

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
  };
  const valueCls: Record<MetricTone, string> = {
    default: "text-gray-900",
    teal: "text-teal-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-600 border border-gray-200 bg-white hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50/50 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}