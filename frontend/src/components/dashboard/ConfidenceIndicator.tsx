// src/components/dashboard/ConfidenceIndicator.tsx
// 의사용 신뢰도 시각화 컴포넌트
//
// 구간 기준:
//   90%↑  : 초록 — 확정 권장
//   70~90%: 노랑 — 참고용
//   <70%  : 빨강 — 재검 권장

// ----------------------------- 신뢰도 구간 -----------------------------
export type ConfidenceLevel = "high" | "mid" | "low";

export interface ConfidenceBand {
  level: ConfidenceLevel;
  label: string;           // "확정 권장" | "참고용" | "재검 권장"
  description: string;     // 의사용 설명
  barColor: string;        // 막대 색 (bg-*)
  textColor: string;       // 텍스트 색
  bgColor: string;         // 배경 색 (라벨 배지)
  borderColor: string;     // 테두리 색
  dotColor: string;        // 점 색
}

export function getConfidenceBand(conf: number): ConfidenceBand {
  if (conf >= 0.9) {
    return {
      level: "high",
      label: "확정 권장",
      description: "신뢰도가 높아 확정 가능한 결과입니다.",
      barColor: "bg-green-500",
      textColor: "text-green-700",
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      dotColor: "bg-green-500",
    };
  }
  if (conf >= 0.7) {
    return {
      level: "mid",
      label: "참고용",
      description: "신뢰도가 보통水平으로 참고용으로 활용하세요.",
      barColor: "bg-amber-500",
      textColor: "text-amber-700",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      dotColor: "bg-amber-500",
    };
  }
  return {
    level: "low",
    label: "재검 권장",
    description: "신뢰도가 낮아 재검토가 필요한 결과입니다.",
    barColor: "bg-rose-500",
    textColor: "text-rose-700",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
    dotColor: "bg-rose-500",
  };
}

// ----------------------------- 테이블용 (Compact) -----------------------------
// 테이블 행에 들어가는 작은 버전 — 진단 라벨 + 막대 + % + 라벨 배지
interface CompactProps {
  label: string | null;       // "LUAD" | "LUSC" | null
  confidence: number | null;  // 0~1
  luadProbability?: number | null;
  luscProbability?: number | null;
}

export function ConfidenceCompact({
  label,
  confidence,
  luadProbability,
  luscProbability,
}: CompactProps) {
  if (confidence == null) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const band = getConfidenceBand(confidence);
  const luad = luadProbability ?? 0;
  const lusc = luscProbability ?? 0;

  return (
    <div className="flex items-center gap-2">
      {/* 진단 라벨 */}
      <span
        className={`text-xs font-semibold w-11 ${
          label === "LUAD" ? "text-indigo-600" : "text-teal-600"
        }`}
      >
        {label ?? "—"}
      </span>

      {/* 신뢰도 막대 (구간 색상) */}
      <div className="flex flex-col gap-0.5">
        <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-indigo-500" style={{ width: `${luad * 100}%` }} />
          <div className="h-full bg-teal-500" style={{ width: `${lusc * 100}%` }} />
        </div>
        {/* 구간 색상 막대 (작은 점 형태) */}
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${band.dotColor}`} />
          <span className={`text-[10px] font-medium ${band.textColor}`}>
            {band.label}
          </span>
        </div>
      </div>

      {/* 퍼센트 */}
      <span className="text-xs tabular-nums text-gray-500 w-9 text-right">
        {(confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ----------------------------- 모달용 (Detail) -----------------------------
// 요약/리뷰 모달에 들어가는 큰 버전 — 막대 + 라벨 배지 + 설명
interface DetailProps {
  confidence: number | null;
  luadProbability?: number | null;
  luscProbability?: number | null;
  showDescription?: boolean;  // 설명 문구 표시 여부 (기본 true)
}

export function ConfidenceDetail({
  confidence,
  luadProbability,
  luscProbability,
  showDescription = true,
}: DetailProps) {
  if (confidence == null) {
    return (
      <div className="text-sm text-gray-400">신뢰도 정보 없음</div>
    );
  }

  const band = getConfidenceBand(confidence);
  const percent = (confidence * 100).toFixed(1);
  const luad = luadProbability ?? 0;
  const lusc = luscProbability ?? 0;

  return (
    <div className="space-y-2">
      {/* 라벨 배지 + 퍼센트 */}
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${band.bgColor} ${band.textColor} border ${band.borderColor}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${band.dotColor}`} />
          {band.label}
        </span>
        <span className={`text-lg font-bold tabular-nums ${band.textColor}`}>
          {percent}%
        </span>
      </div>

      {/* 큰 신뢰도 막대 */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {/* LUAD/LUSC 비율 막대 */}
        <div className="h-full bg-indigo-500" style={{ width: `${luad * 100}%` }} />
        <div className="h-full bg-teal-500" style={{ width: `${lusc * 100}%` }} />
        {/* 70% / 90% 기준선 */}
        <div className="absolute top-0 bottom-0 w-px bg-gray-300" style={{ left: "70%" }} />
        <div className="absolute top-0 bottom-0 w-px bg-gray-300" style={{ left: "90%" }} />
      </div>

      {/* 기준선 라벨 */}
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>0%</span>
        <span>70%</span>
        <span>90%</span>
        <span>100%</span>
      </div>

      {/* 설명 */}
      {showDescription && (
        <p className={`text-xs ${band.textColor} leading-relaxed`}>
          {band.description}
        </p>
      )}

      {/* 범례 */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-1">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-indigo-500" /> LUAD
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-teal-500" /> LUSC
        </span>
      </div>
    </div>
  );
}

// ----------------------------- 배지만 (Badge) -----------------------------
// 테이블 헤더나 카운트에 쓸 수 있는 작은 배지만 필요할 때
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence == null) return null;
  const band = getConfidenceBand(confidence);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${band.bgColor} ${band.textColor}`}
    >
      <span className={`h-1 w-1 rounded-full ${band.dotColor}`} />
      {band.label}
    </span>
  );
}
