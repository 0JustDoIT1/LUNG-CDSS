import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { predictCase, getCase } from "../api/cases";
import type { CaseStep } from "../types/case";

const ANALYSIS_STEPS: { key: Exclude<CaseStep, null>; name: string; msg: string }[] = [
  { key: "uploaded", name: "업로드 확인", msg: "파일 무결성을 확인하고 있습니다…" },
  { key: "preprocessing", name: "전처리", msg: "타일링 및 색상 정규화 수행 중…" },
  { key: "feature_extraction", name: "특징 추출", msg: "슬라이드에서 특징을 추출하고 있습니다… (5~6분 소요)" },
  { key: "classification", name: "분류", msg: "LUAD/LUSC 분류 모델 실행 중…" },
  { key: "nuclei_detection", name: "핵 검출", msg: "세포핵 위치를 탐지하고 있습니다…" },
  { key: "generating_result", name: "결과 생성", msg: "리포트를 생성하고 있습니다…" },
];

const POLL_INTERVAL_MS = 1000;

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isPreview = id === "preview";

  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [status, setStatus] = useState<"running" | "completed" | "failed">("running");
  const [error, setError] = useState<string | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 경과 시간 타이머 — analyzed_at을 받으면 실제 시작 시각 기준으로 계산
  useEffect(() => {
    if (status !== "running") return;
  
    timerRef.current = setInterval(() => {
      if (analyzedAt) {
        const elapsed = Math.floor((Date.now() - new Date(analyzedAt).getTime()) / 1000);
        setElapsedSec(elapsed >= 0 ? elapsed : 0);
      } else {
        setElapsedSec((s) => s + 1);
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [analyzedAt, status]);

  // 미리보기 모드: 가짜 진행
  useEffect(() => {
    if (!isPreview) return;
    let idx = 0;
    const mockTimer = setInterval(() => {
      idx++;
      if (idx >= ANALYSIS_STEPS.length) {
        clearInterval(mockTimer);
        setStatus("completed");
      } else {
        setStepIndex(idx);
      }
    }, 1500);
    return () => clearInterval(mockTimer);
  }, [isPreview]);

  // 실제 모드: predict 호출 후 폴링
  const startedRef = useRef(false);

  useEffect(() => {
    if (isPreview || !id) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function start() {
      try {
        await predictCase(id!);
      } catch (e: any) {
        if (e?.response?.status !== 409) {
          if (!cancelled) {
            setError("분석 요청에 실패했습니다.");
            setStatus("failed");
          }
          return;
        }
      }

    pollRef.current = setInterval(async () => {
      try {
        const detail = await getCase(id!);
        console.log("[분석 폴링] current_step:", JSON.stringify(detail.current_step), "status:", detail.status);
        const idx = ANALYSIS_STEPS.findIndex((s) => s.key === detail.current_step);
        if (idx >= 0) {
          setStepIndex(idx);
        } else {
          console.warn("[분석 폴링] current_step이 ANALYSIS_STEPS 키와 매칭 안 됨:", detail.current_step);
        }
      
        if (detail.analyzed_at) {
          setAnalyzedAt(detail.analyzed_at);
        }
      
        if (detail.status === "completed") {
          setStatus("completed");
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (detail.status === "failed") {
          setStatus("failed");
          setError("분석 중 오류가 발생했습니다.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // 폴링 중 일시적 에러는 무시하고 다음 폴링에서 재시도
      }
    }, POLL_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, isPreview]);

  const current = ANALYSIS_STEPS[stepIndex];
  const progressPct = Math.min(((stepIndex + 0.5) / ANALYSIS_STEPS.length) * 100, 95);

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
        <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">
          {status === "completed" ? "분석 완료" : status === "failed" ? "분석 실패" : "분석 진행 중"}
        </h1>
        <p className="text-[13px] text-gray-500 mt-1.5">
          {status === "running" && "AI가 슬라이드를 분석하고 있습니다. 잠시만 기다려 주세요."}
          {status === "completed" && "결과가 준비되었습니다. 결과 보기를 클릭하세요."}
          {status === "failed" && "분석 중 문제가 발생했습니다."}
        </p>

        {status === "completed" && (
          <div className="mt-4 flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-sm font-semibold text-green-800">분석이 완료되었습니다!</p>
              <p className="text-xs text-green-600">아래 버튼을 눌러 결과를 확인하세요.</p>
            </div>
          </div>
        )}
      </header>

      {status !== "failed" && (
        <div className="border border-teal-100 rounded-2xl bg-teal-50/40 px-6 py-5 mb-6">
          <h3 className="text-[15px] font-semibold text-gray-900">
            {status === "completed" ? "결과 생성" : current.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {status === "completed" ? "리포트 생성이 완료되었습니다." : current.msg}
          </p>
          <div className="flex gap-4 mt-2.5 text-[11px] text-gray-500">
            <span>⏱ {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}</span>
            <span>단계 {status === "completed" ? ANALYSIS_STEPS.length : stepIndex + 1}/{ANALYSIS_STEPS.length}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${status === "completed" ? 100 : progressPct}%` }}
            />
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="border border-red-200 rounded-2xl bg-red-50 px-6 py-5 mb-6">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {status !== "failed" && (
        <div className="space-y-0 mb-6">
          {ANALYSIS_STEPS.map((step, i) => {
            const state =
              status === "completed" ? "done" : i < stepIndex ? "done" : i === stepIndex ? "active" : "waiting";
            return (
              <div key={step.key} className="flex items-start gap-3 relative pb-5 last:pb-0">
                {i < ANALYSIS_STEPS.length - 1 && (
                  <div
                    className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${
                      state === "done" ? "bg-green-700" : "bg-gray-200"
                    }`}
                  />
                )}
                <div
                  className={`w-[28px] h-[28px] rounded-full border-2 flex items-center justify-center text-[11px] font-semibold flex-shrink-0 relative z-10 ${
                    state === "done"
                      ? "border-green-700 bg-green-100 text-green-700"
                      : state === "active"
                      ? "border-teal-500 bg-teal-50 text-teal-600"
                      : "border-gray-300 bg-white text-gray-300"
                  }`}
                >
                  {i + 1}
                </div>
                <div
                  className={`text-[13px] pt-1 ${
                    state === "done"
                      ? "text-green-700 font-medium"
                      : state === "active"
                      ? "text-teal-600 font-semibold"
                      : "text-gray-400"
                  }`}
                >
                  {step.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => navigate("/", { state: { openCaseId: id } })}
          disabled={status === "running"}
          className="px-4.5 py-2.5 rounded-lg text-[13px] font-semibold bg-green-700 text-white hover:bg-green-800 transition disabled:opacity-45 disabled:cursor-not-allowed"
        >
          결과 보기 →
        </button>
        <button
          type="button"
          onClick={() => navigate("/upload")}
          className="px-4.5 py-2.5 rounded-lg text-[13px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
        >
          업로드로 돌아가기
        </button>
      </div>
    </div>
  );
}