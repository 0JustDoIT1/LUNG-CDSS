import type { CaseDetail, GeneName } from "../types/case";

// 유전자 변이 → 표적치료제 매핑 (NCCN 가이드라인 기준)
// GeneName = "TP53" | "KEAP1" | "KRAS" 중 현재 승인된 표적치료제가 있는 건 KRAS(G12C)뿐.
// TP53 / KEAP1은 직접 타겟하는 약제가 없고 예후·면역치료 저항성 관련 인자이므로
// 여기 포함하지 않음 — 필요 시 [비고]에 참고 문구로만 추가.
const GENE_TREATMENT_MAP: Partial<
  Record<GeneName, { drug: string; note: string; guideline: string }>
> = {
  KRAS: {
    drug: "Sotorasib",
    note: "KRAS G12C 양성 시 고려",
    guideline: "NCCN v3.2026",
  },
};

// 표적치료 제안 임계값 — 이 값 미만이면 노트에 포함하지 않음
const TREATMENT_SUGGESTION_THRESHOLD = 0.5;

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function buildGeneLine(caseData: CaseDetail): string {
  const genes = caseData.gene_predictions ?? [];
  if (genes.length === 0) return "- 유전자 변이: 분석 결과 없음";
  const line = genes
    .map((g) => `${g.gene_name} ${formatPercent(g.likelihood)}`)
    .join(", ");
  return `- 유전자 변이: ${line}`;
}

function buildNucleiLine(caseData: CaseDetail): string {
  const level = caseData.nuclei_density_level;
  const score = caseData.nuclei_density_score;
  if (level == null && score == null) return "- 핵 밀도: —";
  const scoreStr = score != null ? ` (${score.toFixed(2)})` : "";
  return `- 핵 밀도: ${level ?? "—"}${scoreStr}`;
}

function buildTreatmentSection(caseData: CaseDetail): string | null {
  const genes = caseData.gene_predictions ?? [];
  const candidates = genes
    .filter((g) => g.likelihood >= TREATMENT_SUGGESTION_THRESHOLD)
    .filter((g) => GENE_TREATMENT_MAP[g.gene_name])
    .sort((a, b) => b.likelihood - a.likelihood);

  if (candidates.length === 0) return null;

  const lines = candidates.map((g) => {
    const t = GENE_TREATMENT_MAP[g.gene_name]!;
    return `- ${t.drug} (${t.note})`;
  });

  const guideline = GENE_TREATMENT_MAP[candidates[0].gene_name]!.guideline;

  return ["[표적치료 제안]", ...lines, `- 참고 가이드라인: ${guideline}`].join("\n");
}

export function buildClinicalNote(caseData: CaseDetail): string {
  const confidence =
    caseData.luad_probability != null
      ? Math.max(caseData.luad_probability, caseData.lusc_probability ?? 0)
      : null;

  const sections: string[] = [];

  sections.push(
    [
      "[병리 진단 결과]",
      `- Specimen ID: ${caseData.specimen_id ?? "—"}`,
      `- 진단: ${caseData.prediction_label ?? "—"}${
        caseData.prediction_label === "LUAD"
          ? " (Lung Adenocarcinoma)"
          : caseData.prediction_label === "LUSC"
          ? " (Lung Squamous Cell Carcinoma)"
          : ""
      }`,
      `- 신뢰도: ${formatPercent(confidence)}`,
      buildNucleiLine(caseData),
      buildGeneLine(caseData),
    ].join("\n")
  );

  const treatmentSection = buildTreatmentSection(caseData);
  if (treatmentSection) sections.push(treatmentSection);

  sections.push(
    ["[비고]", "- AI 보조 진단 결과이므로 최종 판단은 병리 전문의가 수행"].join("\n")
  );

  return sections.join("\n\n");
}