import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useLocation } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { login } from "../api/auth";
import type { LoginPayload } from "../types/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const signupSuccess = (location.state as { signupSuccess?: boolean } | null)?.signupSuccess;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginPayload>();

  async function onSubmit(data: LoginPayload) {
    setServerError(null);
    try {
      const result = await login(data);
      if (result.role === "doctor") {
        navigate("/doctor-dashboard");
      } else {
        navigate("/");
      }
    } catch {
      setServerError("병원코드 또는 비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4" noValidate>
        {signupSuccess && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            회원가입이 완료되었습니다. 로그인해주세요.
          </p>
        )}
        <div>
          <label htmlFor="login-hospital-code" className="block text-xs font-medium mb-1.5 text-gray-700">
            병원코드
          </label>
          <input
            id="login-hospital-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            //{...register("hospital_code", { required: "병원코드를 입력해주세요." })}
            {...register("hospital_code", {
              required: "병원코드를 입력해주세요.",
              pattern: { value: /^\d{6}$/, message: "병원코드는 숫자 6자리입니다." },
            })}            
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-1 transition ${
              errors.hospital_code
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
            placeholder="숫자 6자리"
          />
          {errors.hospital_code && <p className="text-[11px] text-red-500 mt-1.5">{errors.hospital_code.message}</p>}
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