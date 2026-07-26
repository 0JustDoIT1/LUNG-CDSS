import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../api/auth";

const NAV_ITEMS = [
  { to: "/", label: "결과리스트" },
  { to: "/upload", label: "업로드" },
];

const DEPARTMENT_LABELS: Record<string, string> = {
  pathology: "병리과",
  pulmonology: "호흡기내과",
  oncology: "종양내과",
};

export default function PathologistLayout() {
  const navigate = useNavigate();

  const userName = localStorage.getItem("user_name");
  const userDepartment = localStorage.getItem("user_department");

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <aside className="w-[180px] flex-shrink-0 bg-[#faf9f6] border-r border-[#e2e0da] p-3.5 flex flex-col">
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

        {/* 계정 정보 + 로그아웃 - 사이드바 맨 아래 */}
        <div className="mt-auto pt-3 border-t border-[#e2e0da]">
          {userName && (
            <div className="px-2 py-1.5 mb-1">
              <p className="text-xs font-medium text-[#333] truncate">{userName}</p>
              {userDepartment && (
                <p className="text-[11px] text-[#999]">
                  {DEPARTMENT_LABELS[userDepartment] ?? userDepartment}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-[#666] border border-transparent hover:bg-[#f0ede8] hover:text-red-600 transition-colors cursor-pointer"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-7 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}