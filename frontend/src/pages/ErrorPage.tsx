import {
  AlertTriangle,
  ArrowLeft,
  Home,
  RefreshCw,
} from "lucide-react";
import {
  useRouteError,
  isRouteErrorResponse,
  Link,
} from "react-router-dom";

export default function ErrorPage(): React.JSX.Element {
  const error = useRouteError();

  let message = "알 수 없는 오류가 발생했습니다.";
  let statusCode: number | null = null;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    message = error.statusText || "요청을 처리하는 중 오류가 발생했습니다.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-6">
      {/* 배경 장식 */}
      <div className="absolute left-[-100px] top-[-100px] h-72 w-72 rounded-full bg-red-100/60 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[-100px] h-80 w-80 rounded-full bg-orange-100/60 blur-3xl" />

      <section className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white/90 px-8 py-12 text-center shadow-xl shadow-slate-200/60 backdrop-blur-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle
            size={30}
            className="text-red-500"
            strokeWidth={2}
          />
        </div>

        <p className="mb-2 text-sm font-semibold tracking-[0.25em] text-red-500">
          SOMETHING WENT WRONG
        </p>

        {statusCode && (
          <h1 className="text-7xl font-bold tracking-tight text-slate-900">
            {statusCode}
          </h1>
        )}

        <h2
          className={`text-2xl font-bold text-slate-900 ${
            statusCode ? "mt-5" : "mt-2"
          }`}
        >
          오류가 발생했습니다
        </h2>

        <p className="mx-auto mt-3 max-w-sm break-words text-sm leading-6 text-slate-500">
          {message}
        </p>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          잠시 후 다시 시도하거나 홈으로 이동해 주세요.
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

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <RefreshCw size={17} />
            다시 시도
          </button>

          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
          >
            <Home size={17} />
            홈으로
          </Link>
        </div>
      </section>
    </main>
  );
}