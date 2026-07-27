import { useNavigate } from "react-router-dom";
import { logout } from "../../api/auth";

const DEPARTMENT_LABELS: Record<string, string> = {
  pathology: "병리과",
  pulmonology: "호흡기내과",
  oncology: "종양내과",
};

export default function Header() {
  const navigate = useNavigate();

  const userName = localStorage.getItem("user_name");
  const userDepartment = localStorage.getItem("user_department");

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b-2 border-teal-600 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f6e56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 1 0 0-14h-1" />
            <path d="M9 14h2" /><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
            <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
          </svg>
        </div>
        <span className="font-semibold text-gray-900 text-sm">PathoAI</span>
        <div className="w-px h-4 bg-gray-200" />
        <span className="text-xs text-gray-400">병리 슬라이드 AI 진단 플랫폼</span>
      </div>

      <div className="flex items-center gap-3">
        {userName && (
          <div className="text-right">
            <p className="text-xs font-medium text-gray-700">{userName}</p>
            {userDepartment && (
              <p className="text-[10px] text-gray-400">
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