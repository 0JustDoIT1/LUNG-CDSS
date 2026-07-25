import type { CaseDetail } from "../types/case";

const DIAGNOSIS_FULL_NAME: Record<string, string> = {
  LUAD: "Lung Adenocarcinoma",
  LUSC: "Lung Squamous Cell Carcinoma",
};

function formatConfidence(caseData: CaseDetail): string | null {
  const { luad_probability, lusc_probability } = caseData;
  if (luad_probability == null && lusc_probability == null) return null;
  const conf = Math.max(luad_probability ?? 0, lusc_probability ?? 0);
  return `${(conf * 100).toFixed(0)}%`;
}

function formatGeneList(caseData: CaseDetail): string | null {
  if (!caseData.gene_predictions || caseData.gene_predictions.length === 0) return null;
  return caseData.gene_predictions
    .map((g) => `${g.gene_name} ${(g.likelihood * 100).toFixed(0)}%`)
    .join(", ");
}

/** CaseDetail을 EMR에 붙여넣기 좋은 텍스트 노트 형식으로 변환합니다. */
export function buildClinicalNote(caseData: CaseDetail): string {
  const lines: string[] = [];
  const label = caseData.prediction_label;
  const fullName = label ? DIAGNOSIS_FULL_NAME[label] : null;
  const confidence = formatConfidence(caseData);
  const geneList = formatGeneList(caseData);

  lines.push("[병리 진단 결과]");
  lines.push(`- Specimen ID: ${caseData.specimen_id}`);
  lines.push(`- 진단: ${label ?? "미확정"}${fullName ? ` (${fullName})` : ""}`);
  lines.push(`- 신뢰도: ${confidence ?? "—"}`);
  if (caseData.nuclei_density_level != null) {
    const score = caseData.nuclei_density_score != null ? ` (${caseData.nuclei_density_score.toFixed(2)})` : "";
    lines.push(`- 핵 밀도: ${caseData.nuclei_density_level}${score}`);
  }
  if (caseData.nuclei_irregularity_level != null) {
    const score =
      caseData.nuclei_irregularity_score != null ? ` (${caseData.nuclei_irregularity_score.toFixed(2)})` : "";
    lines.push(`- 핵 불규칙성: ${caseData.nuclei_irregularity_level}${score}`);
  }
  if (geneList) {
    lines.push(`- 유전자 변이: ${geneList}`);
  }

  lines.push("");
  lines.push("[표적치료 제안]");
  lines.push(caseData.treatment_note ?? "아직 생성된 치료 제안이 없습니다.");

  lines.push("");
  lines.push("[비고]");
  lines.push("- AI 보조 진단 결과이므로 최종 판단은 병리 전문의가 수행합니다.");
  lines.push(`- 생성일시: ${new Date().toLocaleString("ko-KR")}`);

  return lines.join("\n");
}