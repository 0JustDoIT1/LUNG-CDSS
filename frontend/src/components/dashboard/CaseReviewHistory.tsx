import { useEffect, useState } from "react";
import { CheckCircle2, History, Loader2, PencilLine } from "lucide-react";
import { getCaseReviewLogs } from "../../api/cases";
import type { CaseReviewLog } from "../../types/case";

export function CaseReviewHistory({ caseId }: { caseId: string }): React.JSX.Element {
  const [logs, setLogs] = useState<CaseReviewLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getCaseReviewLogs(caseId)
      .then((data) => {
        if (!active) return;
        setLogs(data);
        setError(null);
      })
      .catch(() => {
        if (active) setError("판독 이력을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [caseId]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-5 py-3.5">
        <History className="h-4 w-4 text-teal-600" />
        <div>
          <h2 className="text-sm font-semibold text-gray-900">판독 이력</h2>
          <p className="mt-0.5 text-xs text-gray-500">이 케이스의 승인 및 수정 기록입니다.</p>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 이력을 불러오는 중입니다.
          </div>
        ) : error ? (
          <p className="py-3 text-sm text-rose-600">{error}</p>
        ) : logs.length === 0 ? (
          <p className="py-3 text-sm text-gray-400">아직 판독 이력이 없습니다.</p>
        ) : (
          <ol className="space-y-4">
            {logs.map((log) => {
              const edited = log.action === "edited";
              const Icon = edited ? PencilLine : CheckCircle2;
              return (
                <li key={log.id} className="flex gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${edited ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 border-b border-gray-100 pb-4 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {edited ? "수정 후 확정" : "AI 결과 승인"} · {log.subtype_at_time}
                      </p>
                      <time className="text-xs tabular-nums text-gray-400">
                        {new Date(log.created_at).toLocaleString("ko-KR")}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">판독의: {log.reviewer_name}</p>
                    {log.note_at_time ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700">
                        {log.note_at_time}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
