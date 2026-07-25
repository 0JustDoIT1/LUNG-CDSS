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
  return <th className="text-left px-4 py-2.5 font-semibold text-xs">{children}</th>;
}

type MetricTone = "default" | "teal" | "rose" | "amber";

export function MetricCard({
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
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-teal-50 text-teal-700 hover:bg-teal-100"
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}