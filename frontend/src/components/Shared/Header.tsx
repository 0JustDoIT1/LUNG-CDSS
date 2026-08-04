import { NavLink, useNavigate } from "react-router-dom";
import { logout } from "../../api/auth";
import { getStoredItem } from "../../utils/storage";
import NotificationCenter from "./NotificationCenter";

const DEPARTMENT_LABELS: Record<string, string> = {
  pathology: "병리과",
  pulmonology: "호흡기내과",
  oncology: "종양내과",
};

export default function Header() {
  const navigate = useNavigate();

  const userName = getStoredItem("user_name");
  const userDepartment = getStoredItem("user_department");
  const userRole = getStoredItem("user_role");

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b-2 border-teal-600 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center">
          <img src="/logo.png" alt="OncoLensAI 로고" className="w-full h-full object-contain" />
        </div>
        <span className="font-black text-gray-1000 text-xl">OncoLensAI</span>
        <div className="w-px h-4 bg-gray-200" />
        <span className="text-xs text-gray-400">병리 슬라이드 AI 진단 플랫폼</span>
        {userRole === "doctor" ? (
          <nav className="ml-3 hidden items-center gap-1 lg:flex" aria-label="의사 메뉴">
            {[
              ["/doctor-dashboard", "대시보드"],
              ["/doctor-dashboard/chat", "의료진 채팅"],
              ["/doctor-dashboard/schedule", "진료 일정"],
              ["/doctor-dashboard/profile", "내 프로필"],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/doctor-dashboard"}
                className={({ isActive }) =>
                  `rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? "bg-teal-50 text-teal-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <NotificationCenter />
        {userName && (
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-700">{userName}</p>
            {userDepartment && (
              <p className="text-[12px] text-gray-500">
                {DEPARTMENT_LABELS[userDepartment] ?? userDepartment}
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 hover:text-red-600 transition-colors cursor-pointer"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
