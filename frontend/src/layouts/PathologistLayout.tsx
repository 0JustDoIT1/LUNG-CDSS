import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
    { to: "/", label: "결과리스트" },
    { to: "/upload", label: "업로드" },
];

export default function PathologistLayout() {
  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <aside className="w-[180px] flex-shrink-0 bg-[#EEF2FF] border-r border-[#e2e0da] p-3.5 flex flex-col">
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors border ${
                  isActive
                    ? "bg-white border-[#e2e0da] text-[#111] font-medium shadow-sm"
                    : "border-transparent text-[#666] hover:bg-[#f0ede8] hover:text-[#333]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-7 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}