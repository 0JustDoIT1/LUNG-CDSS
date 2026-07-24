import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { login } from "../api/auth";
import type { LoginPayload } from "../types/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginPayload>();

  async function onSubmit(data: LoginPayload) {
    setServerError(null);
    try {
      await login(data);
      navigate("/");
    } catch {
      setServerError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4" noValidate>
        <div>
          <label htmlFor="login-username" className="block text-xs font-medium mb-1.5 text-gray-700">
            아이디
          </label>
          <input
            id="login-username"
            type="text"
            {...register("username", { required: "아이디를 입력해주세요." })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-1 transition ${
              errors.username
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
            placeholder="아이디 입력"
          />
          {errors.username && <p className="text-[11px] text-red-500 mt-1.5">{errors.username.message}</p>}
        </div>

        <div>
          <label htmlFor="login-pw" className="block text-xs font-medium mb-1.5 text-gray-700">
            비밀번호
          </label>
          <input
            id="login-pw"
            type="password"
            {...register("password", { required: "비밀번호를 입력해주세요." })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-1 transition ${
              errors.password
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
            placeholder="••••••••"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            8~16자, 영문자·숫자·특수문자를 모두 포함해야 합니다.
          </p>
          {errors.password && <p className="text-[11px] text-red-500 mt-1">{errors.password.message}</p>}
        </div>

        {serverError && <p className="text-xs text-red-500">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-xl text-sm font-medium transition hover:opacity-90 bg-indigo-600 text-white disabled:opacity-50"
        >
          {isSubmitting ? "로그인 중..." : "로그인"}
        </button>

        <p className="text-center text-xs mt-3 text-gray-500">
          계정이 없으신가요?{" "}
          <span className="cursor-pointer font-medium text-indigo-600" onClick={() => navigate("/signup")}>
            회원가입
          </span>
        </p>
      </form>
    </AuthLayout>
  );
}