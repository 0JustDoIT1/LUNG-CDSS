import React, { useEffect, useState } from "react";
import { Plus, X, Pin } from "lucide-react";
import { getStoredItem, setStoredItem } from "../../utils/storage";

interface StickyTodo {
  id: string;
  text: string;
  done: boolean;
}

const STORAGE_KEY_PREFIX = "doctor_sticky_todos_";

// crypto.randomUUID는 보안 컨텍스트(https/localhost)에서만 동작하므로
// 어떤 환경에서도 동작하는 안전한 ID 생성 함수로 대체
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getTodayKey(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${STORAGE_KEY_PREFIX}${y}-${m}-${d}`;
}

function loadTodos(storageKey: string): StickyTodo[] {
  try {
    const raw = getStoredItem(storageKey);
    return raw ? (JSON.parse(raw) as StickyTodo[]) : [];
  } catch {
    return [];
  }
}

export function DoctorStickyNote(): React.JSX.Element {
  const [storageKey] = useState(getTodayKey);
  const [todos, setTodos] = useState<StickyTodo[]>(() => loadTodos(storageKey));
  const [input, setInput] = useState("");

  useEffect(() => {
    setStoredItem(storageKey, JSON.stringify(todos));
  }, [todos, storageKey]);

  function addTodo(): void {
    const text = input.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: generateId(), text, done: false }]);
    setInput("");
  }

  function toggleTodo(id: string): void {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function removeTodo(id: string): void {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Pin className="w-3 h-3 text-amber-500" />
        <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">오늘 할 일</p>
      </div>

      <div className="space-y-1 max-h-40 overflow-y-auto">
        {todos.length === 0 && (
          <p className="text-xs text-amber-600/60 italic py-1">할 일을 추가해 보세요</p>
        )}
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-2 group">
            <button
              onClick={() => toggleTodo(todo.id)}
              aria-label="완료 체크"
              className={`w-3.5 h-3.5 shrink-0 rounded-sm border transition-colors ${
                todo.done ? "bg-amber-600 border-amber-600" : "bg-white/70 border-amber-400"
              }`}
            />
            <span
              className={`flex-1 text-xs leading-tight ${
                todo.done ? "line-through text-amber-500/70" : "text-amber-900"
              }`}
            >
              {todo.text}
            </span>
            <button
              onClick={() => removeTodo(todo.id)}
              aria-label="삭제"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-500 hover:text-amber-700"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-1 pt-1.5 border-t border-amber-200/70">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
          }}
          placeholder="할 일 입력 후 Enter"
          className="flex-1 text-xs bg-transparent placeholder:text-amber-500/50 text-amber-900 focus:outline-none py-1"
        />
        <button onClick={addTodo} aria-label="추가" className="text-amber-600 hover:text-amber-800 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
