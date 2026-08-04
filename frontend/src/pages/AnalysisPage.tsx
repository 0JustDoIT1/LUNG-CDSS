import { useState, useEffect, useRef } from 'react';
import type { AxiosError } from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock3, List, RotateCcw } from 'lucide-react';
import { predictCase, getCase, retryCaseAnalysis } from '../api/cases';
import { UnifiedCaseResultSections } from '../components/dashboard/UnifiedCaseResultSections';
import { PrintableReport } from '../components/dashboard/PrintableReport';
import type { CaseDetail, CaseStep } from '../types/case';

const ANALYSIS_STEPS: {
  key: Exclude<CaseStep, null>;
  name: string;
  msg: string;
}[] = [
  {
    key: 'uploaded',
    name: '업로드 확인',
    msg: '파일 무결성을 확인하고 있습니다…',
  },
  {
    key: 'preprocessing',
    name: '전처리',
    msg: '타일링 및 색상 정규화 수행 중…',
  },
  {
    key: 'feature_extraction',
    name: '특징 추출',
    msg: '슬라이드에서 특징을 추출하고 있습니다… (5~6분 소요)',
  },
  { key: 'classification', name: '분류', msg: 'LUAD/LUSC 분류 모델 실행 중…' },
  {
    key: 'nuclei_detection',
    name: '핵 검출',
    msg: '세포핵 위치를 탐지하고 있습니다…',
  },
  {
    key: 'generating_result',
    name: '결과 생성',
    msg: '리포트를 생성하고 있습니다…',
  },
];

const POLL_INTERVAL_MS = 2000;
const SLOW_PROGRESS_MS = 5 * 60 * 1000;

const ERROR_TITLES: Record<string, string> = {
  QUEUE_UNAVAILABLE: '분석 대기열에 연결하지 못했습니다.',
  UPSTREAM_ERROR: 'AI 분석 서버에 연결하지 못했습니다.',
  PROCESSING_ERROR: '분석 결과를 처리하지 못했습니다.',
  ANALYSIS_TIMEOUT: '분석 시간이 초과되었습니다.',
};

function relativeUpdateLabel(value: string | null): string {
  if (!value) return '업데이트 기록 대기 중';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isPreview = id === 'preview';

  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [status, setStatus] = useState<'running' | 'completed' | 'failed'>(
    'running'
  );
  const [error, setError] = useState<string | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [resultDetail, setResultDetail] = useState<CaseDetail | null>(null);
  const [initialized, setInitialized] = useState(isPreview);
  const [retrying, setRetrying] = useState(false);
  const [lastProgressAt, setLastProgressAt] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string>('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 경과 시간 타이머 — analyzed_at을 받으면 실제 시작 시각 기준으로 계산
  useEffect(() => {
    if (status !== 'running') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      if (analyzedAt) {
        const elapsed = Math.floor(
          (Date.now() - new Date(analyzedAt).getTime()) / 1000
        );
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
        setStatus('completed');
      } else {
        setStepIndex(idx);
      }
    }, 1500);
    return () => clearInterval(mockTimer);
  }, [isPreview]);

  // 서버의 기존 상태를 먼저 복원한 뒤, 신규 케이스만 분석 대기열에 등록한다.
  useEffect(() => {
    if (isPreview || !id) return;
    let cancelled = false;

    void getCase(id)
      .then(async (detail) => {
        if (cancelled) return;
        if (detail.analyzed_at) setAnalyzedAt(detail.analyzed_at);
        setLastProgressAt(detail.last_progress_at);

        if (detail.status === 'uploaded') {
          const queued = await predictCase(id);
          if (!cancelled && queued.analyzed_at) setAnalyzedAt(queued.analyzed_at);
        } else if (detail.status === 'failed') {
          setStatus('failed');
          setErrorCode(detail.analysis_error_code);
          setError(detail.analysis_error_message || '분석 중 오류가 발생했습니다.');
        } else if (detail.status === 'pending_review' || detail.status === 'confirmed') {
          setResultDetail(detail);
          setStatus('completed');
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const payload = (e as AxiosError<{ error?: { message?: string } }>).response?.data;
        setError(payload?.error?.message || '분석 요청에 실패했습니다.');
        setStatus('failed');
      })
      .finally(() => {
        if (!cancelled) setInitialized(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isPreview]);

  // ---------------- 폴링 (predict 요청과 무관하게 독립 실행) ----------------
  useEffect(() => {
    if (isPreview || !id || !initialized) return;
    if (status !== 'running') return;

    let cancelled = false;

    pollRef.current = setInterval(async () => {
      try {
        const detail = await getCase(id);
        if (cancelled) return;

        console.log(
          '[분석 폴링] current_step:',
          JSON.stringify(detail.current_step),
          'status:',
          detail.status
        );
        const idx = ANALYSIS_STEPS.findIndex(
          (s) => s.key === detail.current_step
        );
        if (idx >= 0) {
          setStepIndex(idx);
        } else {
          console.warn(
            '[분석 폴링] current_step이 ANALYSIS_STEPS 키와 매칭 안 됨:',
            detail.current_step
          );
        }

        if (detail.analyzed_at) {
          setAnalyzedAt(detail.analyzed_at);
        }
        setLastProgressAt(detail.last_progress_at);

        if (
          detail.status === 'pending_review' ||
          detail.status === 'confirmed'
        ) {
          setResultDetail(detail);
          setStatus('completed');
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (detail.status === 'failed') {
          setStatus('failed');
          setErrorCode(detail.analysis_error_code);
          setError(detail.analysis_error_message || '분석 중 오류가 발생했습니다.');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // 폴링 중 일시적 에러는 무시하고 다음 폴링에서 재시도
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, initialized, isPreview, status]);

  async function handleRetry() {
    if (!id || retrying) return;
    setRetrying(true);
    setError(null);
    setErrorCode('');
    try {
      const queued = await retryCaseAnalysis(id);
      setAnalyzedAt(queued.analyzed_at);
      setLastProgressAt(queued.last_progress_at);
      setElapsedSec(0);
      setStepIndex(0);
      setResultDetail(null);
      setStatus('running');
    } catch (e: unknown) {
      const payload = (e as AxiosError<{ error?: { message?: string } }>).response?.data;
      setError(payload?.error?.message || '분석 재시도 요청에 실패했습니다.');
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    if (isPreview || !id || status !== 'completed' || resultDetail) return;

    let cancelled = false;
    getCase(id)
      .then((detail) => {
        if (!cancelled) setResultDetail(detail);
      })
      .catch(() => {
        if (!cancelled) setError('완료된 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      });

    return () => {
      cancelled = true;
    };
  }, [id, isPreview, resultDetail, status]);

  const current = ANALYSIS_STEPS[stepIndex];
  const progressPct = Math.min(
    ((stepIndex + 0.5) / ANALYSIS_STEPS.length) * 100,
    95
  );
  const progressAgeMs = lastProgressAt ? Date.now() - new Date(lastProgressAt).getTime() : elapsedSec * 1000;
  const isSlow = status === 'running' && progressAgeMs >= SLOW_PROGRESS_MS;
  const friendlyErrorTitle = ERROR_TITLES[errorCode] ?? '분석을 완료하지 못했습니다.';

  return (
    <div>
      <header className="mb-5">
        <p className="text-xs font-medium text-gray-400">진단 워크플로우</p>
        <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">
          {status === 'completed'
            ? '분석 완료'
            : status === 'failed'
              ? '분석 실패'
              : '분석 진행 중'}
        </h1>
        <p className="text-[13px] text-gray-500 mt-1.5">
          {status === 'running' &&
            'AI가 슬라이드를 분석하고 있습니다. 잠시만 기다려 주세요.'}
          {status === 'completed' &&
            '원본 이미지와 AI 분석 결과가 아래에 모두 표시됩니다.'}
          {status === 'failed' && '분석 중 문제가 발생했습니다.'}
        </p>

        {status === 'completed' && (
          <div className="mt-4 flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="text-sm font-semibold text-green-800">
                분석이 완료되었습니다!
              </p>
              <p className="text-xs text-green-600">
                이 화면에서 진단, 히트맵, 핵형태와 AI 소견을 이어서 확인하세요.
              </p>
            </div>
          </div>
        )}
      </header>

      {status !== 'failed' && (
        <div className="border border-teal-100 rounded-2xl bg-teal-50/40 px-6 py-5 mb-6">
          <h3 className="text-[15px] font-semibold text-gray-900">
            {status === 'completed' ? '결과 생성' : current.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {status === 'completed'
              ? '리포트 생성이 완료되었습니다.'
              : current.msg}
          </p>
          <div className="flex gap-4 mt-2.5 text-[11px] text-gray-500">
            <span>
              ⏱ {Math.floor(elapsedSec / 60)}:
              {String(elapsedSec % 60).padStart(2, '0')}
            </span>
            <span>
              단계{' '}
              {status === 'completed' ? ANALYSIS_STEPS.length : stepIndex + 1}/
              {ANALYSIS_STEPS.length}
            </span>
            {status === 'running' ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" /> 마지막 업데이트 {relativeUpdateLabel(lastProgressAt)}
              </span>
            ) : null}
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full transition-all duration-500"
              style={{
                width: `${status === 'completed' ? 100 : progressPct}%`,
              }}
            />
          </div>
          {isSlow ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>평소보다 분석이 오래 걸리고 있습니다. 작업은 서버에서 계속 진행되므로 화면을 닫아도 괜찮습니다.</p>
            </div>
          ) : null}
        </div>
      )}

      {status === 'failed' && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-gray-900">{friendlyErrorTitle}</h2>
                {errorCode ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] text-rose-600">{errorCode}</span> : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-gray-600">잠시 후 다시 시도해 주세요. 반복되면 담당자에게 오류 코드를 전달해 주세요.</p>
            </div>
          </div>
          {error ? (
            <details className="mt-4 rounded-xl bg-gray-50 px-3.5 py-3 text-xs text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700">상세 오류 보기</summary>
              <p className="mt-2 break-words leading-5">{error}</p>
            </details>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {!isPreview ? (
              <button
                type="button"
                onClick={() => void handleRetry()}
                disabled={retrying}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                <RotateCcw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? '재시도 등록 중...' : '분석 재시도'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/cases')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto"
            >
              <List className="h-4 w-4" /> 케이스 목록으로
            </button>
          </div>
        </div>
      )}

      {status === 'running' && (
        <div className="space-y-0 mb-6">
          {ANALYSIS_STEPS.map((step, i) => {
            const state =
              i < stepIndex
                ? 'done'
                : i === stepIndex
                  ? 'active'
                  : 'waiting';
            return (
              <div
                key={step.key}
                className="flex items-start gap-3 relative pb-5 last:pb-0"
              >
                {i < ANALYSIS_STEPS.length - 1 && (
                  <div
                    className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${
                      state === 'done' ? 'bg-green-700' : 'bg-gray-200'
                    }`}
                  />
                )}
                <div
                  className={`w-[28px] h-[28px] rounded-full border-2 flex items-center justify-center text-[11px] font-semibold flex-shrink-0 relative z-10 ${
                    state === 'done'
                      ? 'border-green-700 bg-green-100 text-green-700'
                      : state === 'active'
                        ? 'border-teal-500 bg-teal-50 text-teal-600'
                        : 'border-gray-300 bg-white text-gray-300'
                  }`}
                >
                  {i + 1}
                </div>
                <div
                  className={`text-[13px] pt-1 ${
                    state === 'done'
                      ? 'text-green-700 font-medium'
                      : state === 'active'
                        ? 'text-teal-600 font-semibold'
                        : 'text-gray-400'
                  }`}
                >
                  {step.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {status === 'completed' && resultDetail && (
        <div className="mb-6">
          <UnifiedCaseResultSections caseData={resultDetail} />
          <PrintableReport caseData={resultDetail} />
        </div>
      )}

      {status === 'completed' && !resultDetail && !isPreview && (
        <div className="mb-6 flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-10 text-sm text-gray-500">
          결과 데이터를 불러오는 중입니다…
        </div>
      )}

      <div className="flex gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/upload')}
          className="px-4.5 py-2.5 rounded-lg text-[13px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
        >
          업로드로 돌아가기
        </button>
      </div>
    </div>
  );
}
