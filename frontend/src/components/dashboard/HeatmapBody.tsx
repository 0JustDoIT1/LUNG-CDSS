import { useState, useEffect, useCallback, useRef } from "react";
import {
  Layers,
  Eye,
  SplitSquareHorizontal,
  Pen,
  Eraser,
  Hand,
  Undo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  
  
} from "lucide-react";
import type { CaseDetail, Stroke } from "../../types/case";
import { EmptyNote } from "./shared";

type ViewMode = "split" | "overlay" | "heatmap" | "original";
type Tool = "move" | "pen" | "eraser";

export function HeatmapBody({ caseData }: { caseData: CaseDetail }) {
  const [mode, setMode] = useState<ViewMode>("split");
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.55);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState<string>("#e11d48");
  const [brushSize, setBrushSize] = useState<number>(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPanning = useRef<boolean>(false);
  const isDrawing = useRef<boolean>(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentStroke = useRef<Stroke | null>(null);

  const hasOriginal = Boolean(caseData.slide_thumbnail_url);
  const hasHeatmap = Boolean(caseData.heatmap_url);
  const canDraw = mode === "heatmap" || mode === "overlay";

  // ---------------- 캔버스 다시 그리기 ----------------
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showAnnotations) return;
    strokes.forEach((s) => {
      if (!s) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      );
      ctx.stroke();
    });
  }, [strokes, showAnnotations]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  if (!hasHeatmap) {
    return <EmptyNote text="히트맵이 아직 생성되지 않았습니다." />;
  }

  // ---------------- 줌/팬/드로잉 ----------------
  function clamp(z: number): number {
    return Math.min(Math.max(z, 1), 8);
  }

  // passive wheel 이슈 회피 — 컨테이너에 직접 리스너
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z + (e.deltaY < 0 ? 0.2 : -0.2)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // 줌/팬 역변환 → 캔버스 좌표 (드로잉 좌표 어긋남 방지)
  function toCanvasPoint(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    return {
      x: cx * canvas.width,
      y: cy * canvas.height,
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
        color,
        size: tool === "eraser" ? brushSize * 5 : brushSize,
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
      const p = toCanvasPoint(e);
      currentStroke.current.points.push(p);
      const ctx = canvasRef.current?.getContext("2d");
      const s = currentStroke.current;
      if (ctx && s.points.length > 1) {
        if (tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = s.color;
        }
        ctx.lineWidth = s.size;
        ctx.lineCap = "round";
        const a = s.points[s.points.length - 2];
        const b = s.points[s.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
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

  // ---------------- 액션 ----------------
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

  // ---------------- 뷰 모드 버튼 ----------------
  const modeButtons: { v: ViewMode; label: string; icon: typeof SplitSquareHorizontal; disabled?: boolean }[] = [
    { v: "split", label: "비교", icon: SplitSquareHorizontal, disabled: !hasOriginal },
    { v: "overlay", label: "오버레이", icon: Layers, disabled: !hasOriginal },
    { v: "heatmap", label: "히트맵", icon: Eye },
    { v: "original", label: "원본", icon: Eye, disabled: !hasOriginal },
  ];

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  // ---------------- 렌더 ----------------
  return (
    <div className="space-y-3">
      {/* 상단 툴바 — 뷰 모드 + 도구 + 줌 */}
      <div className="flex items-center gap-2 flex-wrap p-2 bg-white border border-gray-200 rounded-xl">
        {/* 뷰 모드 */}
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {modeButtons.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.v}
                disabled={b.disabled}
                onClick={() => setMode(b.v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === b.v
                    ? "bg-teal-600 text-white shadow-sm"
                    : b.disabled
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {b.label}
              </button>
            );
          })}
        </div>

        {/* 오버레이 모드일 때만 투명도 슬라이더 */}
        {mode === "overlay" && (
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
            <span className="text-[11px] text-gray-500">투명도</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(overlayOpacity * 100)}
              onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)}
              className="w-24"
            />
            <span className="text-[11px] text-gray-600 tabular-nums w-8">
              {Math.round(overlayOpacity * 100)}%
            </span>
          </div>
        )}

        <div className="h-5 w-px bg-gray-200 mx-1" />

        {/* 드로잉 도구 (히트맵/오버레이 모드에서만) */}
        {canDraw && (
          <>
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <ToolIconBtn active={tool === "move"} onClick={() => setTool("move")} icon={Hand} label="이동" />
              <ToolIconBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={Pen} label="펜" />
              <ToolIconBtn active={tool === "eraser"} onClick={() => setTool("eraser")} icon={Eraser} label="지우개" />
            </div>

            {/* 색상 */}
            <div className="flex items-center gap-1">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className="w-5 h-5 rounded-full ring-1 ring-gray-200 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline:
                      color === c ? "2px solid #0d9488" : "none",
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>

            {/* 굵기 */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-[11px] text-gray-500">굵기</span>
              <input
                type="range"
                min={1}
                max={12}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-[11px] text-gray-600 tabular-nums w-5">
                {brushSize}
              </span>
            </div>

            {/* 주석 토글 + 실행취소 + 전체삭제 */}
            <button
              onClick={() => setShowAnnotations((v) => !v)}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium ${
                showAnnotations
                  ? "bg-teal-50 text-teal-700 border border-teal-200"
                  : "bg-gray-50 text-gray-400 border border-gray-200"
              }`}
              title="주석 표시/숨김"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={undo}
              disabled={strokes.length === 0}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              title="실행 취소"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={clearAll}
              disabled={strokes.length === 0}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 disabled:opacity-40"
              title="전체 지우기"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* 줌 컨트롤 — 우측 끝 */}
        <div className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setZoom((z) => clamp(z - 0.25))}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-white"
            title="축소"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-600 tabular-nums w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => clamp(z + 0.25))}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-white"
            title="확대"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetView}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-white"
            title="원래 크기"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 이미지 영역 */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-200 select-none"
        style={{ height: 560, cursor: tool === "move" || !canDraw ? "grab" : "crosshair" }}
      >
        {/* split 모드 — 원본 | 히트맵 */}
        {mode === "split" && hasOriginal && (
          <div className="flex h-full w-full">
            <div
              className="relative flex-1 overflow-hidden border-r border-white/10"
              style={{ transform, transformOrigin: "center" }}
            >
              <img
                src={caseData.slide_thumbnail_url as string}
                alt="원본"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium">
                원본
              </div>
            </div>
            <div
              className="relative flex-1 overflow-hidden"
              style={{ transform, transformOrigin: "center" }}
            >
              <img
                src={caseData.heatmap_url as string}
                alt="히트맵"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium">
                히트맵
              </div>
            </div>
          </div>
        )}

        {/* overlay 모드 — 원본 위에 히트맵 얹기 */}
        {mode === "overlay" && hasOriginal && (
          <div
            className="relative h-full w-full"
            style={{ transform, transformOrigin: "center" }}
          >
            <img
              src={caseData.slide_thumbnail_url as string}
              alt="원본"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            <img
              src={caseData.heatmap_url as string}
              alt="히트맵"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
              style={{ opacity: overlayOpacity }}
            />
          </div>
        )}

        {/* heatmap 단독 */}
        {mode === "heatmap" && (
          <div
            className="relative h-full w-full"
            style={{ transform, transformOrigin: "center" }}
          >
            <img
              src={caseData.heatmap_url as string}
              alt="히트맵"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          </div>
        )}

        {/* original 단독 */}
        {mode === "original" && hasOriginal && (
          <div
            className="relative h-full w-full"
            style={{ transform, transformOrigin: "center" }}
          >
            <img
              src={caseData.slide_thumbnail_url as string}
              alt="원본"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          </div>
        )}

        {/* 드로잉 캔버스 — heatmap/overlay 모드에서만 */}
        {canDraw && (
          <canvas
            ref={canvasRef}
            width={1200}
            height={560}
            className="absolute inset-0 w-full h-full"
            style={{
              transform,
              transformOrigin: "center",
              touchAction: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        )}

        {/* 우측 하단 — 줌 표시 (작은 표시) */}
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[11px] tabular-nums">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* 안내 문구 */}
      <p className="text-xs text-gray-400 leading-relaxed">
        {canDraw ? (
          <>
            <span className="text-gray-500 font-medium">사용법:</span>{" "}
            휠로 확대/축소 · 이동 도구로 드래그 · 펜으로 주석 · 지우개로 삭제
            {strokes.length > 0 && (
              <span className="ml-2 text-teal-600">· 주석 {strokes.length}개</span>
            )}
          </>
        ) : (
          "휠로 확대/축소, 드래그로 이동할 수 있습니다."
        )}
      </p>
    </div>
  );
}

// ---------------- 서브 컴포넌트 ----------------
function ToolIconBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Pen;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-teal-600 text-white shadow-sm"
          : "text-gray-600 hover:bg-white"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
