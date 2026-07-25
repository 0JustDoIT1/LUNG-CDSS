import React, { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import type { CaseDetail } from "../../types/case";
import apiClient from "../../api/client";
import { buildGeneComparison, getMaxConfidence } from "../../utils/caseCompare";

interface CompareModalProps {
  caseIdA: string;
  caseIdB: string;
  onClose: () => void;
}

export function CompareModal({ caseIdA, caseIdB, onClose }: CompareModalProps): React.JSX.Element {
  const [caseA, setCaseA] = useState<CaseDetail | null>(null);
  const [caseB, setCaseB] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [resA, resB] = await Promise.all([
          apiClient.get<CaseDetail>(`/cases/${caseIdA}/`),
          apiClient.get<CaseDetail>(`/cases/${caseIdB}/`),
        ]);
        if (active) {
          setCaseA(resA.data);
          setCaseB(resB.data);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [caseIdA, caseIdB]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-lg text-gray-900">케이스 비교</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="닫기">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-16 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> 케이스 불러오는 중...
            </div>
          )}
          {error && <div className="text-sm text-rose-600 py-8 text-center">에러: {error}</div>}
          {!loading && !error && caseA && caseB && <CompareBody caseA={caseA} caseB={caseB} />}
        </div>
      </div>
    </div>
  );
}

function CompareBody({ caseA, caseB }: { caseA: CaseDetail; caseB: CaseDetail }): React.JSX.Element {
  const confA = getMaxConfidence(caseA);
  const confB = getMaxConfidence(caseB);
  const confDelta = confA != null && confB != null ? Math.abs(confA - confB) : null;
  const diagnosisMismatch =
    caseA.prediction_label != null &&
    caseB.prediction_label != null &&
    caseA.prediction_label !== caseB.prediction_label;
  const genes = buildGeneComparison(caseA, caseB);

  return (
    <div className="space-y-5">
      {diagnosisMismatch && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100">
            <AlertTriangle className="h-3 w-3 text-rose-700" />
          </div>
          <p className="text-sm text-rose-900">
            <span className="font-medium">두 케이스의 진단 결과가 다릅니다.</span>{" "}
            <span className="text-rose-700">
              {caseA.specimen_id}: {caseA.prediction_label} · {caseB.specimen_id}: {caseB.prediction_label}
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <CaseSummaryCard caseData={caseA} />
        <CaseSummaryCard caseData={caseB} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[caseA, caseB].map((c) => (
          <div key={c.id} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-900 aspect-video">
            {c.heatmap_url ? (
              <img src={c.heatmap_url} alt={`${c.specimen_id} 히트맵`} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                히트맵 없음
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">항목</th>
              <th className="text-left px-4 py-2.5 font-medium">{caseA.specimen_id}</th>
              <th className="text-left px-4 py-2.5 font-medium">{caseB.specimen_id}</th>
              <th className="text-left px-4 py-2.5 font-medium">차이</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <CompareRow
              label="신뢰도"
              a={confA != null ? `${(confA * 100).toFixed(1)}%` : "—"}
              b={confB != null ? `${(confB * 100).toFixed(1)}%` : "—"}
              delta={confDelta != null ? `${(confDelta * 100).toFixed(1)}%p` : "—"}
              highlight={confDelta != null && confDelta >= 0.15}
            />
            <CompareRow
              label="핵 밀도"
              a={caseA.nuclei_density_level ?? "—"}
              b={caseB.nuclei_density_level ?? "—"}
              delta={caseA.nuclei_density_level !== caseB.nuclei_density_level ? "다름" : "동일"}
              highlight={caseA.nuclei_density_level !== caseB.nuclei_density_level}
            />
            <CompareRow
              label="핵 불규칙성"
              a={caseA.nuclei_irregularity_level ?? "—"}
              b={caseB.nuclei_irregularity_level ?? "—"}
              delta={caseA.nuclei_irregularity_level !== caseB.nuclei_irregularity_level ? "다름" : "동일"}
              highlight={caseA.nuclei_irregularity_level !== caseB.nuclei_irregularity_level}
            />
          </tbody>
        </table>
      </div>

      {genes.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-600">유전자 변이 예측 비교</p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium">유전자</th>
                <th className="text-left px-4 py-2 font-medium">{caseA.specimen_id}</th>
                <th className="text-left px-4 py-2 font-medium">{caseB.specimen_id}</th>
                <th className="text-left px-4 py-2 font-medium">차이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {genes.map((g) => (
                <tr key={g.gene}>
                  <td className="px-4 py-2 font-medium text-gray-700">{g.gene}</td>
                  <td className="px-4 py-2 tabular-nums text-gray-600">
                    {g.a != null ? `${(g.a * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-gray-600">
                    {g.b != null ? `${(g.b * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td
                    className={`px-4 py-2 tabular-nums font-medium ${
                      g.delta != null && g.delta >= 0.2 ? "text-rose-600" : "text-gray-400"
                    }`}
                  >
                    {g.delta != null ? `${(g.delta * 100).toFixed(0)}%p` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CaseSummaryCard({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const label = caseData.prediction_label;
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <p className="font-mono text-xs text-gray-500">{caseData.specimen_id}</p>
      <p
        className={`text-lg font-semibold mt-1 ${
          label === "LUAD" ? "text-indigo-600" : label === "LUSC" ? "text-teal-600" : "text-gray-400"
        }`}
      >
        {label ?? "미확정"}
      </p>
    </div>
  );
}

function CompareRow({
  label,
  a,
  b,
  delta,
  highlight,
}: {
  label: string;
  a: string;
  b: string;
  delta: string;
  highlight: boolean;
}): React.JSX.Element {
  return (
    <tr>
      <td className="px-4 py-2.5 text-gray-500">{label}</td>
      <td className="px-4 py-2.5 tabular-nums text-gray-800">{a}</td>
      <td className="px-4 py-2.5 tabular-nums text-gray-800">{b}</td>
      <td className={`px-4 py-2.5 font-medium ${highlight ? "text-rose-600" : "text-gray-400"}`}>{delta}</td>
    </tr>
  );
}