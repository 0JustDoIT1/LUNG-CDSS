import React, { useState } from "react";
import type { CaseDetail } from "../../types/case";
import { AnalysisStatusNote } from "./shared";
import { SummaryBody } from "./SummaryBody";
import { HeatmapBody } from "./HeatmapBody";
import { NucleusBody } from "./NucleusBody";

type ResultTab = "summary" | "heatmap" | "nucleus";

const RESULT_TABS: { id: ResultTab; label: string; description: string }[] = [
  { id: "summary", label: "결과 요약", description: "원본 이미지와 진단 소견" },
  { id: "heatmap", label: "히트맵", description: "병변 위치와 주목 영역" },
  { id: "nucleus", label: "핵형태", description: "핵 밀도와 불규칙성" },
];

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 bg-gray-50/80">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function QuickStat({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 break-words">{value}</p>
    </div>
  );
}

export function UnifiedCaseResultSections({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ResultTab>("summary");
  const luad = caseData.luad_probability;
  const lusc = caseData.lusc_probability;
  const confidence = luad != null ? Math.max(luad, lusc ?? 0) : null;

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tab: ResultTab): void {
    const currentIndex = RESULT_TABS.findIndex((item) => item.id === tab);
    let nextIndex: number;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % RESULT_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + RESULT_TABS.length) % RESULT_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = RESULT_TABS.length - 1;
    else return;

    event.preventDefault();
    const nextTab = RESULT_TABS[nextIndex].id;
    setActiveTab(nextTab);
    document.getElementById(`result-tab-${nextTab}`)?.focus();
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl">
        <div
          role="tablist"
          aria-label="검사 결과 항목"
          className="grid min-w-[390px] grid-cols-3 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm"
        >
          {RESULT_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`result-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`result-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              className={`rounded-xl px-2 py-3 text-center transition sm:px-4 ${
                active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
            >
              <span className="block text-sm font-semibold sm:text-[15px]">{tab.label}</span>
              <span className={`mt-0.5 hidden text-[11px] sm:block ${active ? "text-teal-50" : "text-gray-400"}`}>
                {tab.description}
              </span>
            </button>
          );
          })}
        </div>
      </div>

      {activeTab === "summary" && (
        <div id="result-panel-summary" role="tabpanel" aria-labelledby="result-tab-summary">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <SectionCard
              title="원본 슬라이드"
              description="업로드된 썸네일과 현재 상태를 함께 확인합니다."
            >
              <div className="space-y-4">
                <div className="aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-200 flex items-center justify-center">
                  {caseData.slide_thumbnail_url ? (
                    <img
                      src={caseData.slide_thumbnail_url}
                      alt={`${caseData.specimen_id} 원본 슬라이드`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <AnalysisStatusNote status={caseData.status} fallbackText="원본 이미지가 없습니다." />
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <QuickStat label="검체 ID" value={caseData.specimen_id} />
                  <QuickStat label="환자" value={caseData.patient_name ?? "—"} />
                  <QuickStat label="진단" value={caseData.prediction_label ?? "—"} />
                  <QuickStat label="신뢰도" value={confidence != null ? `${(confidence * 100).toFixed(1)}%` : "—"} />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="결과 요약"
              description="AI 분류, 확률, 유전자 예측, 소견을 한 번에 확인합니다."
            >
              <SummaryBody caseData={caseData} />
            </SectionCard>
          </section>
        </div>
      )}

      {activeTab === "heatmap" && (
        <div id="result-panel-heatmap" role="tabpanel" aria-labelledby="result-tab-heatmap">
          <SectionCard
            title="히트맵"
            description="원본, 히트맵, 오버레이, 주석을 같은 화면에서 비교할 수 있습니다."
          >
            <HeatmapBody caseData={caseData} />
          </SectionCard>
        </div>
      )}

      {activeTab === "nucleus" && (
        <div id="result-panel-nucleus" role="tabpanel" aria-labelledby="result-tab-nucleus">
          <SectionCard
            title="핵형태"
            description="핵 밀도와 불규칙성, 그리고 선택 패치 이미지를 확인합니다."
          >
            <NucleusBody caseData={caseData} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
