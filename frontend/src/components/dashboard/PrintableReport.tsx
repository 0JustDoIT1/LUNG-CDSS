import React from "react";
import type { CaseDetail } from "../../types/case";
import { buildClinicalNote } from "../../utils/clinicalNote";

interface PrintableReportProps {
  caseData: CaseDetail;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const LABEL_KO: Record<string, string> = {
  LUAD: "선암 (Lung Adenocarcinoma)",
  LUSC: "편평세포암 (Lung Squamous Cell Carcinoma)",
};

// 인쇄 전용 리포트. 평소에는 화면에 렌더링되지 않고(.print-only 클래스),
// 인쇄/PDF 저장 시에만 index.css의 @media print 규칙에 의해 노출됩니다.
export function PrintableReport({ caseData }: PrintableReportProps): React.JSX.Element {
  const luad = caseData.luad_probability;
  const lusc = caseData.lusc_probability;
  const confidence = luad != null ? Math.max(luad, lusc ?? 0) : null;
  const note = buildClinicalNote(caseData);
  const hasOriginal = Boolean(caseData.slide_thumbnail_url);
  const hasHeatmap = Boolean(caseData.heatmap_url);

  return (
    <div className="print-only" id="print-root">
      <div style={{ fontFamily: "'Malgun Gothic', 'Noto Sans KR', sans-serif", color: "#111", padding: "12mm" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #111", paddingBottom: "8px", marginBottom: "16px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>병리 진단 결과 리포트</h1>
            <p style={{ fontSize: "11px", color: "#555", margin: "2px 0 0" }}>NSCLC (비소세포폐암) 아형 분류 — AI 보조 진단</p>
          </div>
          <div style={{ textAlign: "right", fontSize: "11px", color: "#555" }}>
            <p style={{ margin: 0 }}>출력일시: {formatDateTime(new Date().toISOString())}</p>
          </div>
        </div>

        {/* 케이스 기본 정보 */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "16px" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 8px", fontWeight: 600, width: "18%", background: "#f3f4f6" }}>Specimen ID</td>
              <td style={{ padding: "4px 8px", width: "32%" }}>{caseData.specimen_id}</td>
              <td style={{ padding: "4px 8px", fontWeight: 600, width: "18%", background: "#f3f4f6" }}>업로드</td>
              <td style={{ padding: "4px 8px", width: "32%" }}>{formatDateTime(caseData.uploaded_at)}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>분석 완료</td>
              <td style={{ padding: "4px 8px" }}>{formatDateTime(caseData.completed_at)}</td>
              <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>검토 상태</td>
              <td style={{ padding: "4px 8px" }}>
                {caseData.review_status === "confirmed" ? "승인" : caseData.review_status === "rejected" ? "미승인" : "대기"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 이미지: 원본 + 히트맵 */}
        {(hasOriginal || hasHeatmap) && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", pageBreakInside: "avoid" }}>
            {hasOriginal && (
              <div style={{ flex: 1, border: "1px solid #ccc", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ background: "#111", color: "#fff", fontSize: "10px", padding: "3px 6px" }}>원본 슬라이드</div>
                <img
                  src={caseData.slide_thumbnail_url as string}
                  alt="원본 슬라이드"
                  style={{ width: "100%", height: "70mm", objectFit: "contain", background: "#000" }}
                />
              </div>
            )}
            {hasHeatmap && (
              <div style={{ flex: 1, border: "1px solid #ccc", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ background: "#111", color: "#fff", fontSize: "10px", padding: "3px 6px" }}>Attention 히트맵</div>
                <img
                  src={caseData.heatmap_url as string}
                  alt="히트맵"
                  style={{ width: "100%", height: "70mm", objectFit: "contain", background: "#000" }}
                />
              </div>
            )}
          </div>
        )}

        {/* 진단 요약 */}
        <div style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, borderBottom: "1px solid #999", paddingBottom: "4px", marginBottom: "8px" }}>
            AI 진단 요약
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: 600, width: "18%", background: "#f3f4f6" }}>AI 진단 분류</td>
                <td style={{ padding: "4px 8px", fontWeight: 700 }}>
                  {caseData.prediction_label ? LABEL_KO[caseData.prediction_label] ?? caseData.prediction_label : "—"}
                </td>
                <td style={{ padding: "4px 8px", fontWeight: 600, width: "18%", background: "#f3f4f6" }}>종합 신뢰도</td>
                <td style={{ padding: "4px 8px", fontWeight: 700 }}>{formatPercent(confidence)}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>LUAD 확률</td>
                <td style={{ padding: "4px 8px" }}>{formatPercent(luad)}</td>
                <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>LUSC 확률</td>
                <td style={{ padding: "4px 8px" }}>{formatPercent(lusc)}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>핵 밀도</td>
                <td style={{ padding: "4px 8px" }}>
                  {caseData.nuclei_density_level ?? "—"}
                  {caseData.nuclei_density_score != null ? ` (${caseData.nuclei_density_score.toFixed(2)})` : ""}
                </td>
                <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>핵 이형성</td>
                <td style={{ padding: "4px 8px" }}>
                  {caseData.nuclei_irregularity_level ?? "—"}
                  {caseData.nuclei_irregularity_score != null ? ` (${caseData.nuclei_irregularity_score.toFixed(2)})` : ""}
                </td>
              </tr>
              {caseData.gene_predictions && caseData.gene_predictions.length > 0 && (
                <tr>
                  <td style={{ padding: "4px 8px", fontWeight: 600, background: "#f3f4f6" }}>유전자 변이 예측</td>
                  <td colSpan={3} style={{ padding: "4px 8px" }}>
                    {caseData.gene_predictions.map((g) => `${g.gene_name} ${formatPercent(g.likelihood)}`).join("   ·   ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* AI 소견 */}
        {caseData.treatment_note && (
          <div style={{ marginBottom: "16px", pageBreakInside: "avoid" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 700, borderBottom: "1px solid #999", paddingBottom: "4px", marginBottom: "8px" }}>
              AI 기반 검토 소견
            </h2>
            <p style={{ fontSize: "12px", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{caseData.treatment_note}</p>
          </div>
        )}

        {/* 진료 노트 (EMR용 자동 생성) */}
        <div style={{ marginBottom: "20px", pageBreakInside: "avoid" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, borderBottom: "1px solid #999", paddingBottom: "4px", marginBottom: "8px" }}>
            EMR용 진료 노트
          </h2>
          <pre style={{ fontSize: "11px", lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, border: "1px solid #ddd", borderRadius: "4px", padding: "10px" }}>
            {note}
          </pre>
        </div>

        {/* 서명란 + 안내 문구 */}
        <div style={{ borderTop: "1px solid #999", paddingTop: "10px", fontSize: "10px", color: "#555" }}>
          <p style={{ margin: "0 0 8px" }}>
            ※ 본 결과는 AI 보조 진단 소프트웨어의 분석 결과이며, 최종 진단 및 임상적 판단은 담당 병리 전문의의 소견에 따릅니다.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "32px", marginTop: "16px" }}>
            <span>담당의: ________________________</span>
            <span>서명: ________________________</span>
          </div>
        </div>
      </div>
    </div>
  );
}