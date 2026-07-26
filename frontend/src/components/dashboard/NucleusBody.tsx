import React, { useState } from "react";
import { CircleDot } from "lucide-react";
import type { CaseDetail, NucleiPatch } from "../../types/case";
import { Row, AnalysisStatusNote } from "./shared";

export function NucleusBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const patches: NucleiPatch[] = caseData.nuclei_patches ?? [];
  const [selected, setSelected] = useState<NucleiPatch | null>(patches[0] ?? null);

  if (caseData.status !== "completed") {
    return <AnalysisStatusNote status={caseData.status} fallbackText="핵형태 분석 데이터가 없습니다." />;
  }

  if (patches.length === 0) {
    return <AnalysisStatusNote status={caseData.status} fallbackText="핵 패치 데이터가 없습니다." />;
  }

  return (
    <div className="space-y-3 text-sm">
      {/* 핵 개수 — 최상단 강조 표시 */}
      <div className="flex items-center justify-between rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
            <CircleDot className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-teal-600 font-medium">선택 패치 핵 개수</p>
            <p className="text-2xl font-bold text-teal-800 tabular-nums leading-tight">
              {selected ? `${selected.nuclei_count}개` : "—"}
            </p>
          </div>
        </div>
        {selected && (
          <span className="text-xs text-teal-600 font-medium">어텐션 순위 #{selected.attention_rank ?? "—"}</span>
        )}
      </div>

      <Row label="핵 밀도">
        {caseData.nuclei_density_level ?? "—"}{" "}
        {caseData.nuclei_density_score != null ? `(${caseData.nuclei_density_score.toFixed(2)})` : ""}
      </Row>
      <Row label="핵 불규칙성">
        {caseData.nuclei_irregularity_level ?? "—"}{" "}
        {caseData.nuclei_irregularity_score != null ? `(${caseData.nuclei_irregularity_score.toFixed(2)})` : ""}
      </Row>

      <div className="w-full aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-200">
        {selected ? (
          <img
            src={selected.overlay_url}
            alt={`패치 #${selected.attention_rank}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
            이미지를 선택하세요
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {patches.slice(0, 5).map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className={`aspect-square rounded-lg overflow-hidden relative border-2 transition-colors cursor-pointer ${
              selected?.id === p.id ? "border-teal-600" : "border-transparent hover:border-gray-300"
            }`}
          >
            <img src={p.overlay_url} alt={`패치 #${p.attention_rank}`} className="w-full h-full object-cover" />
            <span className="absolute bottom-0 right-0 text-[8px] bg-black/60 text-white px-0.5 rounded-sm">
              #{p.attention_rank ?? "—"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}