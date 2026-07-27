import { NavLink, Outlet } from "react-router-dom";
import Header from "../components/shared/Header";

const NAV_ITEMS = [
  { to: "/", label: "케이스 리스트" },
  { to: "/upload", label: "업로드" },
];

export default function PathologistLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f7f8fa]">
      <Header />

      <div className="mx-auto w-full max-w-[1400px] p-4 lg:p-6 flex gap-4 items-start min-h-0">
        <aside className="w-[180px] flex-shrink-0 self-start bg-white rounded-2xl shadow-sm border border-gray-100 p-3.5 flex flex-col">
          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors border ${
                    isActive
                      ? "bg-teal-50 border-transparent text-teal-700 font-medium"
                      : "border-transparent text-[#666] hover:bg-gray-50 hover:text-[#333]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}