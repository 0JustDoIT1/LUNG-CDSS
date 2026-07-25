import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { signup } from "../api/auth";
import { PASSWORD_REGEX } from "../utils/validation";
import type { DepartmentCode, SignupPayload, UserRole } from "../types/auth";

const DEPARTMENT_OPTIONS: { value: DepartmentCode; label: string }[] = [
  { value: "pulmonology", label: "호흡기내과" },
  { value: "oncology", label: "종양내과" },
  { value: "pathology", label: "병리과" },
];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "doctor", label: "의사" },
  { value: "pathologist", label: "병리사" },
];

interface SignupFormValues extends SignupPayload {
  password_confirm: string;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    defaultValues: {
      department: DEPARTMENT_OPTIONS[0].value,
      role: ROLE_OPTIONS[0].value,
    },
  });

  const password = watch("password");

async function onSubmit(data: SignupFormValues) {
    setServerError(null);
    setSuccessMessage(null);
    const { password_confirm: _passwordConfirm, ...payload } = data;
    try {
      await signup(payload);
      setSuccessMessage("회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.");
      setTimeout(() => {
        navigate("/login");
      }, 3500);
    } catch (err) {
      const responseData = (err as any)?.response?.data;
      if (responseData && typeof responseData === "object") {
        let hasFieldError = false;
        Object.entries(responseData).forEach(([field, messages]) => {
          if (field === "hospital_code" || field === "name" || field === "department" || field === "role" || field === "password") {
            const message = Array.isArray(messages) ? messages[0] : String(messages);
            setError(field as keyof SignupFormValues, { type: "server", message });
            hasFieldError = true;
          }
        });
        if (!hasFieldError) {
          setServerError("회원가입에 실패했습니다. 입력값을 확인해주세요.");
        }
      } else {
        setServerError("회원가입에 실패했습니다. 입력값을 확인해주세요.");
      }
    }
  }
  return (
    <AuthLayout>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4" noValidate>
        <div>
          <label htmlFor="signup-hospital-code" className="block text-xs font-medium mb-1.5 text-gray-700">
            병원 코드
          </label>
          <input
            id="signup-hospital-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            {...register("hospital_code", {
              required: "병원코드를 입력해주세요.",
              pattern: { value: /^\d{6}$/, message: "병원코드는 숫자 6자리여야 합니다." },
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
          <label htmlFor="signup-name" className="block text-xs font-medium mb-1.5 text-gray-700">
            이름
          </label>
          <input
            id="signup-name"
            type="text"
            {...register("name", { required: "이름을 입력해주세요." })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-1 transition ${
              errors.name
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
            placeholder="이름 입력"
          />
          {errors.name && <p className="text-[11px] text-red-500 mt-1.5">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="signup-department" className="block text-xs font-medium mb-1.5 text-gray-700">
            진료과 코드
          </label>
          <div className="relative">
            <select
              id="signup-department"
              {...register("department", { required: true })}
              className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white"
            >
              {DEPARTMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>      
        <div>
          <label htmlFor="signup-role" className="block text-xs font-medium mb-1.5 text-gray-700">
            역할
          </label>
          <div className="relative">
            <select
              id="signup-role"
              {...register("role", { required: true })}
              className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition bg-white"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>        <div>
          <label htmlFor="signup-pw" className="block text-xs font-medium mb-1.5 text-gray-700">
            비밀번호
          </label>
          <input
            id="signup-pw"
            type="password"
            {...register("password", {
              required: "비밀번호를 입력해주세요.",
              pattern: {
                value: PASSWORD_REGEX,
                message: "8~16자, 영문자·숫자·특수문자를 모두 포함해야 합니다.",
              },
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-1 transition ${
              errors.password
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
            placeholder="8~16자 입력"
          />
          <p className={`text-[11px] mt-1.5 ${errors.password ? "text-red-500" : "text-gray-400"}`}>
            {errors.password ? errors.password.message : "8~16자, 영문자·숫자·특수문자를 모두 포함해야 합니다."}
          </p>
        </div>

        <div>
          <label htmlFor="signup-pw-confirm" className="block text-xs font-medium mb-1.5 text-gray-700">
            비밀번호 확인
          </label>
          <input
            id="signup-pw-confirm"
            type="password"
            {...register("password_confirm", {
              required: "비밀번호를 다시 입력해주세요.",
              validate: (value) => value === password || "비밀번호가 일치하지 않습니다.",
            })}
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-1 transition ${
              errors.password_confirm
                ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
            }`}
            placeholder="비밀번호 재입력"
          />
          {errors.password_confirm && (
            <p className="text-[11px] text-red-500 mt-1.5">{errors.password_confirm.message}</p>
          )}
        </div>

        {serverError && <p className="text-xs text-red-500">{serverError}</p>}
        {serverError && <p className="text-xs text-red-500">{serverError}</p>}
        {successMessage && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            {successMessage}
          </p>
        )}        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-xl text-sm font-medium transition hover:opacity-90 bg-indigo-600 text-white disabled:opacity-50"
        >
          {isSubmitting ? "가입 중..." : "회원가입"}
        </button>

        <p className="text-center text-xs mt-3 text-gray-500">
          이미 계정이 있으신가요?{" "}
          <span className="cursor-pointer font-medium text-indigo-600" onClick={() => navigate("/login")}>
            로그인
          </span>
        </p>
      </form>
    </AuthLayout>
  );
}