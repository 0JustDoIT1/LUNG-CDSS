// src/components/dashboard/CaseTodoPanel.tsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { ClipboardCheck, AlertTriangle, Star, RotateCcw, Check } from "lucide-react";
import type { CaseListItem } from "../../types/case";
import { getStoredItem, setStoredItem } from "../../utils/storage";

// ----------------------------- 타입 -----------------------------
type TodoKind = "review" | "urgent" | "reprocess" | "favorite";

interface CaseTodo {
  id: string;            // `${kind}:${caseId}` 형태의 안정적 ID
  caseId: string;
  specimenId: string;
  kind: TodoKind;
  predictionLabel: string | null;
  confidence: number | null;
  createdAt: string;    // ISO (localStorage 영속)
}

const TODO_LABELS: Record<TodoKind, string> = {
  review: "검토 대기",
  urgent: "재검 권장 (저신뢰도)",
  reprocess: "재처리 필요 (실패)",
  favorite: "즐겨찾기",
};

const TODO_ICONS: Record<TodoKind, typeof ClipboardCheck> = {
  review: ClipboardCheck,
  urgent: AlertTriangle,
  reprocess: RotateCcw,
  favorite: Star,
};

const TODO_DOT_COLORS: Record<TodoKind, string> = {
  review: "bg-gray-400",
  urgent: "bg-rose-500",
  reprocess: "bg-gray-500",
  favorite: "bg-amber-400",
};

// ----------------------------- 유틸 -----------------------------
function getConfidence(c: CaseListItem): number | null {
  if (c.luad_probability == null && c.lusc_probability == null) return null;
  return Math.max(c.luad_probability ?? 0, c.lusc_probability ?? 0);
}

function isUrgent(c: CaseListItem): boolean {
  if (c.status !== "completed") return false;
  const conf = getConfidence(c);
  return conf != null && conf > 0 && conf < 0.7;
}

function isReprocessNeeded(c: CaseListItem): boolean {
  return c.status === "failed";
}

function todoStorageKey(): string {
  return "lung-cdss:todo:completed";
}

function loadCompleted(): Set<string> {
  try {
    const raw = getStoredItem(todoStorageKey());
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function persistCompleted(set: Set<string>): void {
  try {
    setStoredItem(todoStorageKey(), JSON.stringify([...set]));
  } catch {
    // 저장 공간 초과 등은 무시
  }
}

// ----------------------------- 메인 패널 -----------------------------
interface CaseTodoPanelProps {
  cases: CaseListItem[];
  onOpenCase?: (c: CaseListItem) => void;
}

export function CaseTodoPanel({ cases, onOpenCase }: CaseTodoPanelProps): React.JSX.Element {
  // 완료한 todo ID 집합 (localStorage 영속)
  const [completed, setCompleted] = useState<Set<string>>(() => loadCompleted());

  // localStorage 동기화
  useEffect(() => {
    persistCompleted(completed);
  }, [completed]);

  // cases에서 자동으로 todo 추출
  const todos: CaseTodo[] = useMemo(() => {
    const result: CaseTodo[] = [];
    const nowIso = new Date().toISOString();

    for (const c of cases) {
      // 1) 검토 대기
      if (c.status === "completed" && c.review_status === "pending") {
        result.push({
          id: `review:${c.id}`,
          caseId: c.id,
          specimenId: c.specimen_id,
          kind: "review",
          predictionLabel: c.prediction_label ?? null,
          confidence: getConfidence(c),
          createdAt: nowIso,
        });
      }
      // 2) 재검 권장 (저신뢰도)
      if (isUrgent(c)) {
        result.push({
          id: `urgent:${c.id}`,
          caseId: c.id,
          specimenId: c.specimen_id,
          kind: "urgent",
          predictionLabel: c.prediction_label ?? null,
          confidence: getConfidence(c),
          createdAt: nowIso,
        });
      }
      // 3) 재처리 필요 (실패)
      if (isReprocessNeeded(c)) {
        result.push({
          id: `reprocess:${c.id}`,
          caseId: c.id,
          specimenId: c.specimen_id,
          kind: "reprocess",
          predictionLabel: c.prediction_label ?? null,
          confidence: getConfidence(c),
          createdAt: nowIso,
        });
      }
      // 4) 즐겨찾기
      if (c.is_favorite) {
        result.push({
          id: `favorite:${c.id}`,
          caseId: c.id,
          specimenId: c.specimen_id,
          kind: "favorite",
          predictionLabel: c.prediction_label ?? null,
          confidence: getConfidence(c),
          createdAt: nowIso,
        });
      }
    }

    // 우선순위: urgent > reprocess > review > favorite
    const order: Record<TodoKind, number> = {
      urgent: 0,
      reprocess: 1,
      review: 2,
      favorite: 3,
    };
    return result.sort((a, b) => {
      if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
      return (b.confidence ?? 1) - (a.confidence ?? 1); // 신뢰도 낮은 게 먼저
    });
  }, [cases]);

  // 완료/미완료 분리
  const pendingTodos = useMemo(() => todos.filter((t) => !completed.has(t.id)), [todos, completed]);
  const doneTodos = useMemo(() => todos.filter((t) => completed.has(t.id)), [todos, completed]);

  const summary = useMemo(() => {
    const byKind: Record<TodoKind, number> = { review: 0, urgent: 0, reprocess: 0, favorite: 0 };
    for (const t of pendingTodos) byKind[t.kind] += 1;
    return byKind;
  }, [pendingTodos]);

  const handleToggle = useCallback((todoId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  }, []);

  const handleClearDone = useCallback(() => {
    setCompleted(new Set());
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      {/* 헤더 + 요약 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">오늘의 작업</h3>
          {pendingTodos.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 tabular-nums">
              {pendingTodos.length}
            </span>
          )}
        </div>
        {doneTodos.length > 0 && (
          <button
            onClick={handleClearDone}
            className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer"
            title="완료 목록 비우기"
          >
            완료 {doneTodos.length}개 초기화
          </button>
        )}
      </div>

      {/* 종류별 칩 요약 */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TODO_LABELS) as TodoKind[]).map((k) => (
          <span
            key={k}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
              summary[k] > 0
                ? "bg-gray-100 text-gray-700"
                : "bg-gray-50 text-gray-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${TODO_DOT_COLORS[k]}`} />
            {TODO_LABELS[k]}
            <span className="tabular-nums font-medium">{summary[k]}</span>
          </span>
        ))}
      </div>

      {/* 미완료 목록 */}
      <ul className="space-y-1.5 max-h-[420px] overflow-y-auto">
        {pendingTodos.length === 0 ? (
          <li className="text-xs text-gray-400 text-center py-6">
            <Check className="w-5 h-5 mx-auto mb-1.5 text-gray-300" />
            모든 작업이 완료됐습니다
          </li>
        ) : (
          pendingTodos.map((t) => {
            const Icon = TODO_ICONS[t.kind];
            const iconColor =
              t.kind === "urgent"
                ? "text-rose-500"
                : t.kind === "reprocess"
                ? "text-gray-500"
                : t.kind === "favorite"
                ? "text-amber-500"
                : "text-gray-400";
            return (
              <li
                key={t.id}
                className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* 체크 버튼 */}
                <button
                  onClick={() => handleToggle(t.id)}
                  aria-label="완료 처리"
                  className="mt-0.5 w-4 h-4 rounded-full border border-gray-300 hover:border-teal-500 hover:bg-teal-50 transition-colors cursor-pointer shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                    <span className="text-[10px] font-medium text-gray-500">{TODO_LABELS[t.kind]}</span>
                  </div>
                  <button
                    onClick={() => {
  const found = cases.find((c) => c.id === t.caseId);
  if (found) onOpenCase?.(found);
}}
                    className="block text-left mt-0.5 font-mono text-xs text-gray-800 hover:text-teal-600 hover:underline cursor-pointer truncate"
                  >
                    {t.specimenId}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    {t.predictionLabel && <span className="truncate">{t.predictionLabel}</span>}
                    {t.confidence != null && (
                      <span className={`tabular-nums ${
                        t.confidence < 0.7 ? "text-rose-500" : t.confidence < 0.9 ? "text-amber-500" : "text-gray-400"
                      }`}>
                        {(t.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* 완료된 목록 (접기/펴기) */}
      {doneTodos.length > 0 && (
        <details className="border-t border-gray-100 pt-2">
          <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            완료됨 {doneTodos.length}개
          </summary>
          <ul className="space-y-1 max-h-[200px] overflow-y-auto mt-1.5">
            {doneTodos.map((t) => {
              const Icon = TODO_ICONS[t.kind];
              return (
                <li
                  key={t.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg opacity-50 hover:opacity-80 transition-opacity"
                >
                  <button
                    onClick={() => handleToggle(t.id)}
                    aria-label="완료 취소"
                    className="w-4 h-4 rounded-full bg-teal-500 text-white flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Check className="w-2.5 h-2.5" />
                  </button>
                  <Icon className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="font-mono text-[11px] text-gray-500 line-through truncate flex-1">
                    {t.specimenId}
                  </span>
                  <span className="text-[10px] text-gray-300 shrink-0">{TODO_LABELS[t.kind]}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
