import React, { useState } from "react";
import { CircleDot } from "lucide-react";
import type { CaseDetail, NucleiPatch } from "../../types/case";
import { AnalysisStatusNote } from "./shared";

type Level = "high" | "medium" | "low";

// 백엔드 값이 "높음"/"중간"/"낮음" 한글이든 "high"/"medium"/"low" 영문이든 모두 매칭
function normalizeLevel(level?: string | null): Level | null {
  if (!level) return null;
  const v = level.trim().toLowerCase();
  if (v.includes("high") || level.includes("높")) return "high";
  if (v.includes("medium") || v.includes("mid") || level.includes("중")) return "medium";
  if (v.includes("low") || level.includes("낮")) return "low";
  return null;
}

const LEVEL_STYLE: Record<Level, { badge: string; dot: string }> = {
  high: { badge: "bg-rose-50 text-rose-700 border border-rose-200", dot: "bg-rose-500" },
  medium: { badge: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-500" },
  low: { badge: "bg-teal-50 text-teal-700 border border-teal-200", dot: "bg-teal-500" },
};

const DENSITY_NOTE: Record<Level, string> = {
  high: "핵 밀도가 높아 세포 과증식이 두드러지는 소견입니다. 고악성도 패턴과 동반되는 경우가 많아 추가 검토를 권장합니다.",
  medium: "핵 밀도가 중간 수준으로, 다른 소견과 함께 종합적으로 판단이 필요합니다.",
  low: "핵 밀도가 낮아 상대적으로 정상 조직에 가까운 패턴입니다.",
};

const IRREGULARITY_NOTE: Record<Level, string> = {
  high: "핵 모양의 불규칙성이 뚜렷합니다. 이형성(atypia) 가능성을 함께 고려하세요.",
  medium: "핵 모양이 중간 정도의 불규칙성을 보입니다.",
  low: "핵 모양이 비교적 균일한 패턴입니다.",
};

function LevelRow({
  label,
  level,
  score,
  notes,
}: {
  label: string;
  level?: string | null;
  score?: number | null;
  notes: Record<Level, string>;
}): React.JSX.Element {
  const normalized = normalizeLevel(level);
  const style = normalized ? LEVEL_STYLE[normalized] : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {level ? (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              style?.badge ?? "bg-gray-50 text-gray-600 border border-gray-200"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${style?.dot ?? "bg-gray-400"}`} />
            {level}
            {score != null ? ` (${score.toFixed(2)})` : ""}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
      {normalized && <p className="text-[11px] text-gray-400 leading-relaxed">{notes[normalized]}</p>}
    </div>
  );
}

export function NucleusBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const patches: NucleiPatch[] = caseData.nuclei_patches ?? [];
  const [selected, setSelected] = useState<NucleiPatch | null>(patches[0] ?? null);

  if (!["completed", "pending_review", "confirmed"].includes(caseData.status)) {
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

      <LevelRow
        label="핵 밀도"
        level={caseData.nuclei_density_level}
        score={caseData.nuclei_density_score}
        notes={DENSITY_NOTE}
      />
      <LevelRow
        label="핵 불규칙성"
        level={caseData.nuclei_irregularity_level}
        score={caseData.nuclei_irregularity_score}
        notes={IRREGULARITY_NOTE}
      />

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
