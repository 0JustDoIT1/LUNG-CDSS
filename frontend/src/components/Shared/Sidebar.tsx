import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

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
    <aside className="w-[220px] flex-shrink-0 bg-white border-r border-gray-200 py-6 px-3 flex flex-col">
      <p className="text-[11px] font-semibold text-gray-400 tracking-wider px-3 mb-2">MENU</p>
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
                    ? "bg-teal-50 text-teal-700 font-semibold"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-[18px] h-[18px] ${isActive ? "text-teal-600" : "text-gray-400"}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}