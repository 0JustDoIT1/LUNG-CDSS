import type { CaseDetail } from "../types/case";

export interface GeneComparisonRow {
  gene: string;
  a: number | null;
  b: number | null;
  delta: number | null;
}

/** 두 케이스의 유전자 변이 예측을 유전자명 기준으로 정렬해 비교 테이블 형태로 변환합니다. */
export function buildGeneComparison(a: CaseDetail, b: CaseDetail): GeneComparisonRow[] {
  const map = new Map<string, GeneComparisonRow>();
  (a.gene_predictions ?? []).forEach((g) => {
    map.set(g.gene_name, { gene: g.gene_name, a: g.likelihood, b: null, delta: null });
  });
  (b.gene_predictions ?? []).forEach((g) => {
    const existing = map.get(g.gene_name);
    if (existing) {
      existing.b = g.likelihood;
    } else {
      map.set(g.gene_name, { gene: g.gene_name, a: null, b: g.likelihood, delta: null });
    }
  });
  return Array.from(map.values())
    .map((row) => ({
      ...row,
      delta: row.a != null && row.b != null ? Math.abs(row.a - row.b) : null,
    }))
    .sort((x, y) => x.gene.localeCompare(y.gene));
}

export function getMaxConfidence(c: CaseDetail): number | null {
  if (c.luad_probability == null && c.lusc_probability == null) return null;
  return Math.max(c.luad_probability ?? 0, c.lusc_probability ?? 0);
}