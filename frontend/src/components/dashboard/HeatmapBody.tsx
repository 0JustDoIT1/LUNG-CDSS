import React, { useState, useEffect, useCallback, useRef } from "react";
import type { CaseDetail, Stroke } from "../../types/case";
import { EmptyNote } from "./shared";

export function HeatmapBody({ caseData }: { caseData: CaseDetail }): React.JSX.Element {
  const [mode, setMode] = useState<"heatmap" | "original" | "side">("side");
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tool, setTool] = useState<"move" | "pen" | "eraser">("move");
  const [color, setColor] = useState<string>("#e11d48");
  const [brushSize, setBrushSize] = useState<number>(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPanning = useRef<boolean>(false);
  const isDrawing = useRef<boolean>(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentStroke = useRef<Stroke | null>(null);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => {
      if (!s) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  if (!caseData.heatmap_url) {
    return <EmptyNote text="히트맵이 아직 생성되지 않았습니다." />;
  }
  const hasOriginal = Boolean(caseData.slide_thumbnail_url);

  function clamp(z: number): number {
    return Math.min(Math.max(z, 1), 6);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => clamp(z + (e.deltaY < 0 ? 0.15 : -0.15)));
  }

  function toCanvasPoint(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (tool === "move") {
      isPanning.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
    } else {
      isDrawing.current = true;
      const p = toCanvasPoint(e);
      currentStroke.current = {
        color: tool === "eraser" ? "#ffffff" : color,
        size: tool === "eraser" ? brushSize * 4 : brushSize,
        points: [p],
      };
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (isPanning.current) {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (isDrawing.current && currentStroke.current) {
      currentStroke.current.points.push(toCanvasPoint(e));
      const ctx = canvasRef.current?.getContext("2d");
      const s = currentStroke.current;
      if (ctx && s.points.length > 1) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.lineCap = "round";
        const a = s.points[s.points.length - 2];
        const b = s.points[s.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function handlePointerUp() {
    isPanning.current = false;
    if (isDrawing.current && currentStroke.current) {
      setStrokes((prev) => [...prev, currentStroke.current as Stroke]);
    }
    isDrawing.current = false;
    currentStroke.current = null;
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }
  function clearAll() {
    setStrokes([]);
  }
  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const colors = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#111827"];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {hasOriginal && (
          <>
            <ModeBtn active={mode === "side"} onClick={() => setMode("side")}>나란히 보기</ModeBtn>
            <ModeBtn active={mode === "original"} onClick={() => setMode("original")}>원본</ModeBtn>
          </>
        )}
        <ModeBtn active={mode === "heatmap"} onClick={() => setMode("heatmap")}>히트맵</ModeBtn>
      </div>

      <div className="flex gap-2">
        <div
          onWheel={handleWheel}
          className="relative flex-1 rounded-xl overflow-hidden bg-gray-900 border border-gray-200"
          style={{ height: 520, cursor: tool === "move" ? "grab" : "crosshair" }}
        >
          <div
            className={`h-full w-full ${mode === "side" && hasOriginal ? "grid grid-cols-2 gap-px" : ""}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center",
            }}
          >
            {(mode === "original" || mode === "side") && hasOriginal && (
              <img
                src={caseData.slide_thumbnail_url as string}
                alt="원본"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            )}
            {(mode === "heatmap" || mode === "side") && (
              <img
                src={caseData.heatmap_url}
                alt="히트맵"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            )}
          </div>

          {mode === "heatmap" && (
            <canvas
              ref={canvasRef}
              width={800}
              height={520}
              className="absolute inset-0 w-full h-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center",
                touchAction: "none",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          )}

          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-lg px-2 py-1">
            <ToolBtn onClick={() => setZoom((z) => clamp(z - 0.25))} label="줌 아웃">−</ToolBtn>
            <span className="text-white text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <ToolBtn onClick={() => setZoom((z) => clamp(z + 0.25))} label="줌 인">+</ToolBtn>
            <ToolBtn onClick={resetView} label="초기화">⟲</ToolBtn>
          </div>
        </div>

        {mode === "heatmap" && (
          <div className="w-36 shrink-0 space-y-3 bg-gray-50 rounded-xl p-3">
            <div>
              <p className="text-xs text-gray-500 mb-1.5">도구</p>
              <div className="grid grid-cols-3 gap-1">
                <SideToolBtn active={tool === "move"} onClick={() => setTool("move")} label="이동">✥</SideToolBtn>
                <SideToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="펜">✎</SideToolBtn>
                <SideToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="지우개">▭</SideToolBtn>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1.5">색상</p>
              <div className="flex flex-wrap gap-1.5">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={c}
                    className="w-5 h-5 rounded-full"
                    style={{ background: c, outline: color === c ? "2px solid #111827" : "none", outlineOffset: 1 }}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1.5">굵기 {brushSize}px</p>
              <input
                type="range"
                min={1}
                max={12}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5 pt-1">
              <button onClick={undo} className="text-xs px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600">
                실행 취소
              </button>
              <button onClick={clearAll} className="text-xs px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-rose-600">
                전체 지우기
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {mode === "heatmap"
          ? "마우스 휠로 확대/축소, 이동 도구로 드래그, 펜으로 그리기가 가능합니다."
          : "마우스 휠로 확대/축소, 드래그로 이동할 수 있습니다."}
      </p>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
        active ? "border-teal-600 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-6 h-6 flex items-center justify-center rounded bg-white/10 text-white text-sm font-medium hover:bg-white/20"
    >
      {children}
    </button>
  );
}

function SideToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`h-8 rounded-lg text-sm flex items-center justify-center ${
        active ? "bg-teal-600 text-white" : "bg-white border border-gray-200 text-gray-600"
      }`}
    >
      {children}
    </button>
  );
}