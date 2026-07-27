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
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <img src="/logo.png" alt="PathoAI 로고" className="w-full h-full object-contain" />
          </div>
          <p className="font-semibold text-lg text-gray-900">OncoLensAI</p>
          <p className="text-sm mt-1 text-gray-500">병리 슬라이드 AI 진단 플랫폼</p>
        </div>

        <div className="rounded-2xl shadow-sm border border-gray-100 overflow-hidden bg-white">
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:bg-gray-50 ${
                isLogin ? "border-teal-500 text-teal-600" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer hover:bg-gray-50 ${
                !isLogin ? "border-teal-500 text-teal-600" : "border-transparent text-gray-400 hover:text-gray-600"
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