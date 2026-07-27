import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ShieldCheck } from "lucide-react";

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface SidebarProps {
  items: SidebarNavItem[];
}

export default function Sidebar({ items }: SidebarProps) {
  return (
    <aside className="w-[220px] flex-shrink-0 bg-teal-50/50 border-r border-gray-200 py-6 px-3 flex flex-col">
      <p className="text-[11px] font-semibold text-teal-600/70 tracking-wider px-3 mb-2">MENU</p>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  isActive
                    ? "bg-white text-teal-700 font-semibold shadow-sm"
                    : "text-teal-800/70 hover:bg-white/60 hover:text-teal-800"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-[18px] h-[18px] ${isActive ? "text-teal-600" : "text-teal-500/60"}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto px-1 pb-1 pt-6">
        <div className="rounded-xl border border-teal-200 bg-white/90 p-3.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
            </div>

            <p className="text-xs font-semibold text-teal-800">
              의료진 전용 시스템
            </p>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            AI 분석은 진단 보조용입니다.
            <br />
            최종 판단은 의료진이 수행합니다.
          </p>
        </div>
      </div>
    </aside>
  );
}