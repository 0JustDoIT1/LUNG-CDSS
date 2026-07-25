import React, { useState } from "react";
import type { CaseDetail, NucleiPatch } from "../../types/case";
import { Row, EmptyNote } from "./shared";

export function NucleusBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const patches: NucleiPatch[] = caseData.nuclei_patches ?? [];
  const [selected, setSelected] = useState<NucleiPatch | null>(patches[0] ?? null);

  if (patches.length === 0) {
    return <EmptyNote text="핵 패치 데이터가 없습니다." />;
  }

  return (
    <div className="space-y-2 text-sm">
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
            className={`aspect-square rounded-lg overflow-hidden relative border-2 transition-colors ${
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

      {selected && (
        <p className="text-xs text-gray-500">
          선택한 패치 — 어텐션 순위 #{selected.attention_rank ?? "—"}, 핵 개수 {selected.nuclei_count}개
        </p>
      )}
    </div>
  );
}