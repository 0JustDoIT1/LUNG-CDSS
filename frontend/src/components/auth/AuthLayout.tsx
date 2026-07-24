import { useNavigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#F8F9FB" }}>
      <main className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 1 0 0-14h-1" />
              <path d="M9 14h2" /><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
              <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
            </svg>
          </div>
          <p className="font-semibold text-lg text-gray-900">PathoAI</p>
          <p className="text-sm mt-1 text-gray-500">병리 슬라이드 AI 진단 플랫폼</p>
        </div>

        <div className="rounded-2xl shadow-sm border border-gray-100 overflow-hidden bg-white">
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                isLogin ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-400"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                !isLogin ? "border-indigo-500 text-indigo-600" : "border-transparent text-gray-400"
              }`}
            >
              회원가입
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}