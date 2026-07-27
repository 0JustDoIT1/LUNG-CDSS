import { useNavigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden" style={{ background: "#F8F9FB" }}>
      {/* 배경 유기적 블롭 애니메이션 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-20 -left-20 w-[420px] h-[420px] bg-teal-300/60 blur-3xl animate-blob"
          style={{ borderRadius: "42% 58% 65% 35% / 45% 45% 55% 55%" }}
        />
        <div
          className="absolute -bottom-24 -right-16 w-[420px] h-[420px] bg-emerald-300/60 blur-3xl animate-blob"
          style={{ borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%", animationDelay: "2.5s" }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[320px] h-[320px] bg-teal-200/70 blur-3xl animate-blob"
          style={{ borderRadius: "38% 62% 55% 45% / 58% 42% 58% 42%", animationDelay: "5s" }}
        />
      </div>
      <main className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3">
            <img src="/logo.png" alt="OncoLensAI 로고" className="w-full h-full object-contain" />
          </div>
          <p className="font-bold text-xl text-gray-900">OncoLensAI</p>
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