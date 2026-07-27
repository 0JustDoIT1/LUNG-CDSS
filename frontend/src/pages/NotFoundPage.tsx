import { ArrowLeft, Home } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotFoundPage(): React.JSX.Element {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-6">
      {/* 배경 장식 */}
      <div className="absolute left-[-100px] top-[-100px] h-72 w-72 rounded-full bg-blue-100/70 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[-100px] h-80 w-80 rounded-full bg-cyan-100/70 blur-3xl" />

      <section className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white/90 px-8 py-12 text-center shadow-xl shadow-slate-200/60 backdrop-blur-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <span className="text-2xl font-bold text-blue-600">!</span>
        </div>

        <p className="mb-2 text-sm font-semibold tracking-[0.25em] text-blue-600">
          PAGE NOT FOUND
        </p>

        <h1 className="text-7xl font-bold tracking-tight text-slate-900">
          404
        </h1>

        <h2 className="mt-5 text-xl font-semibold text-slate-800">
          페이지를 찾을 수 없습니다
        </h2>

        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
          요청하신 페이지가 삭제되었거나 주소가 변경되었을 수 있습니다.
          입력하신 주소를 다시 확인해 주세요.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <ArrowLeft size={17} />
            이전 페이지
          </button>

          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
          >
            <Home size={17} />
            홈으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}