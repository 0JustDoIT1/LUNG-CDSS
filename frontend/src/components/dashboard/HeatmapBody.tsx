import { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  Layers,
  Eye,
  EyeOff,
  SplitSquareHorizontal,
  Pen,
  Eraser,
  Hand,
  Undo2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  NotebookPen,
  Clock,
} from "lucide-react";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Stage, Layer, Line } from "react-konva";
import type Konva from "konva";
import type { CaseDetail, Stroke } from "../../types/case";
import { AnalysisStatusNote } from "./shared";

type ViewMode = "split" | "overlay" | "heatmap" | "original" | "findings";
type DrawableMode = "heatmap" | "overlay" | "original";
type Tool = "move" | "pen" | "eraser";

interface SavedFinding {
  id: string;
  mode: DrawableMode;
  strokes: Stroke[];
  savedAt: string;
}

const MODE_LABEL: Record<DrawableMode, string> = {
  heatmap: "히트맵",
  overlay: "오버레이",
  original: "원본",
};

function findingsStorageKey(caseId: string): string {
  return `lung-cdss:findings:${caseId}`;
}

function loadFindings(caseId: string): SavedFinding[] {
  try {
    const raw = localStorage.getItem(findingsStorageKey(caseId));
    return raw ? (JSON.parse(raw) as SavedFinding[]) : [];
  } catch {
    return [];
  }
}

function persistFindings(caseId: string, findings: SavedFinding[]) {
  try {
    localStorage.setItem(findingsStorageKey(caseId), JSON.stringify(findings));
  } catch {
    // 저장 공간 초과 등은 조용히 무시 (필요 시 백엔드 저장 API로 대체)
  }
}

export function HeatmapBody({ caseData }: { caseData: CaseDetail }) {
  const [mode, setMode] = useState<ViewMode>("split");
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.55);
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState<string>("#e11d48");
  const [brushSize, setBrushSize] = useState<number>(3);
  const [strokesByMode, setStrokesByMode] = useState<Record<DrawableMode, Stroke[]>>({
    heatmap: [],
    overlay: [],
    original: [],
  });
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [zoomPct, setZoomPct] = useState<number>(1);
  const [saveFlash, setSaveFlash] = useState<boolean>(false);
  const [findings, setFindings] = useState<SavedFinding[]>(() => loadFindings(caseData.id));
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const isDrawing = useRef<boolean>(false);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const [drawTick, setDrawTick] = useState(0); // 그리는 동안 중간 렌더 트리거

  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 1200, h: 560 });

  const hasOriginal = Boolean(caseData.slide_thumbnail_url);
  const hasHeatmap = Boolean(caseData.heatmap_url);
  const canDraw = mode === "heatmap" || mode === "overlay" || mode === "original";

  // ---------------- 컨테이너 실제 픽셀 크기 측정 (줌 전 기준) ----------------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------------- 탭(모드) 전환 시 줌/팬 초기화 ----------------
  useEffect(() => {
    transformRef.current?.resetTransform();
    setZoomPct(1);
  }, [mode]);

  // 소견기록 탭 진입 시 최신 항목 자동 선택
  useEffect(() => {
    if (mode === "findings") {
      setSelectedFindingId((prev) => prev ?? findings[0]?.id ?? null);
    }
  }, [mode, findings]);

  if (caseData.status !== "completed" || (!hasHeatmap && !hasOriginal)) {
    return (
      <AnalysisStatusNote status={caseData.status} fallbackText="히트맵이 아직 생성되지 않았습니다." />
    );
  }

  const strokes = canDraw ? strokesByMode[mode as DrawableMode] : [];

  // ---------------- 드로잉 (mouse + touch 이벤트 기반 — pointer 이벤트보다 Konva 호환성이 좋음) ----------------
  function toStagePoint(stage: Konva.Stage): { x: number; y: number } {
    const pos = stage.getPointerPosition();
    return pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleStageDown(e: Konva.KonvaEventObject<any>) {
    if (!canDraw || tool === "move") return;
    isDrawing.current = true;
    currentPoints.current = [toStagePoint(e.target.getStage() as Konva.Stage)];
    setDrawTick((t) => t + 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleStageMove(e: Konva.KonvaEventObject<any>) {
    if (!isDrawing.current) return;
    currentPoints.current = [...currentPoints.current, toStagePoint(e.target.getStage() as Konva.Stage)];
    setDrawTick((t) => t + 1);
  }

  function handleStageUp() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPoints.current.length > 1 && canDraw) {
      const newStroke: Stroke = {
        color: tool === "eraser" ? "#000000" : color,
        size: tool === "eraser" ? brushSize * 6 : brushSize,
        points: currentPoints.current,
        composite: tool === "eraser" ? "destination-out" : "source-over",
      };
      setStrokesByMode((prev) => ({
        ...prev,
        [mode as DrawableMode]: [...prev[mode as DrawableMode], newStroke],
      }));
    }
    currentPoints.current = [];
    setDrawTick((t) => t + 1);
  }
  // ---------------- 액션 ----------------
  function undo() {
    if (!canDraw) return;
    setStrokesByMode((prev) => ({
      ...prev,
      [mode as DrawableMode]: prev[mode as DrawableMode].slice(0, -1),
    }));
  }
  function clearAll() {
    if (!canDraw) return;
    setStrokesByMode((prev) => ({ ...prev, [mode as DrawableMode]: [] }));
  }
  function saveFinding() {
    if (!canDraw || strokes.length === 0) return;
    const entry: SavedFinding = {
      id: `${Date.now()}`,
      mode: mode as DrawableMode,
      strokes,
      savedAt: new Date().toISOString(),
    };
    const next = [entry, ...findings];
    setFindings(next);
    persistFindings(caseData.id, next);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1600);
  }
  function deleteFinding(id: string) {
    const next = findings.filter((f) => f.id !== id);
    setFindings(next);
    persistFindings(caseData.id, next);
    if (selectedFindingId === id) setSelectedFindingId(next[0]?.id ?? null);
  }

  const colors = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#111827"];

  // ---------------- 뷰 모드 버튼 ----------------
  const modeButtons: { v: ViewMode; label: string; icon: typeof SplitSquareHorizontal; disabled?: boolean }[] = [
    { v: "split", label: "비교", icon: SplitSquareHorizontal, disabled: !hasOriginal || !hasHeatmap },
    { v: "overlay", label: "오버레이", icon: Layers, disabled: !hasOriginal || !hasHeatmap },
    { v: "heatmap", label: "히트맵", icon: Eye, disabled: !hasHeatmap },
    { v: "original", label: "원본", icon: Eye, disabled: !hasOriginal },
  ];

  const selectedFinding = findings.find((f) => f.id === selectedFindingId) ?? null;

  // ---------------- 렌더 ----------------
  return (
    <div className="space-y-3">
      {/* 상단 툴바 — 뷰 모드 탭 + 줌 */}
      <div className="flex items-center gap-2 flex-wrap p-2 bg-white border border-gray-200 rounded-xl">
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {modeButtons.map((b) => {
            const Icon = b.icon;
            return (
              <button
                key={b.v}
                disabled={b.disabled}
                onClick={() => setMode(b.v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
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

          {/* 소견기록 — 원본 버튼 바로 옆 */}
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            onClick={() => setMode("findings")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              mode === "findings"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
            title="이전에 저장한 소견(드로잉) 보기"
          >
            <NotebookPen className="w-3.5 h-3.5" />
            소견기록
            {findings.length > 0 && (
              <span
                className={`ml-0.5 text-[10px] px-1 rounded-full ${
                  mode === "findings" ? "bg-white/20" : "bg-indigo-100 text-indigo-700"
                }`}
              >
                {findings.length}
              </span>
            )}
          </button>
        </div>

        {/* 줌 컨트롤 */}
        {mode !== "findings" && (
          <div className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => transformRef.current?.zoomOut()}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-white cursor-pointer"
              title="축소"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs text-gray-600 tabular-nums w-10 text-center">{Math.round(zoomPct * 100)}%</span>
            <button
              onClick={() => transformRef.current?.zoomIn()}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-white cursor-pointer"
              title="확대"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => transformRef.current?.resetTransform()}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-white cursor-pointer"
              title="원래 크기"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 드로잉 도구 — 비교/오버레이/히트맵/원본 탭 "아래" 별도 줄 */}
      {canDraw && (
        <div className="flex items-center gap-2 flex-wrap p-2 bg-white border border-gray-200 rounded-xl">
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <ToolIconBtn active={tool === "move"} onClick={() => setTool("move")} icon={Hand} label="이동" />
            <ToolIconBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={Pen} label="펜" />
            <ToolIconBtn active={tool === "eraser"} onClick={() => setTool("eraser")} icon={Eraser} label="지우개" />
          </div>

          {/* 팔레트 */}
          <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-gray-50 border border-gray-200">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={c}
                className="w-5 h-5 rounded-full ring-1 ring-gray-200 transition-transform hover:scale-110 cursor-pointer"
                style={{ background: c, outline: color === c ? "2px solid #0d9488" : "none", outlineOffset: 1 }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
            <span className="text-[11px] text-gray-500">굵기</span>
            <input
              type="range"
              min={1}
              max={12}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-20 cursor-pointer"
            />
            <span className="text-[11px] text-gray-600 tabular-nums w-5">{brushSize}</span>
          </div>

          {mode === "overlay" && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-[11px] text-gray-500">투명도</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(overlayOpacity * 100)}
                onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)}
                className="w-24 cursor-pointer"
              />
              <span className="text-[11px] text-gray-600 tabular-nums w-8">{Math.round(overlayOpacity * 100)}%</span>
            </div>
          )}

          <div className="h-5 w-px bg-gray-200 mx-0.5" />

          <button
            onClick={() => setShowAnnotations((v) => !v)}
            className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
              showAnnotations
                ? "bg-teal-50 text-teal-700 border border-teal-200"
                : "bg-gray-50 text-gray-400 border border-gray-200"
            }`}
            title="주석 표시/숨김"
          >
            {showAnnotations ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={undo}
            disabled={strokes.length === 0}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            title="실행 취소"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearAll}
            disabled={strokes.length === 0}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            title="전체 지우기"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={saveFinding}
            disabled={strokes.length === 0}
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              saveFlash ? "bg-teal-600 text-white" : "bg-gray-900 text-white hover:bg-gray-800"
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saveFlash ? "저장됨" : "소견 저장"}
          </button>
        </div>
      )}

      {/* ---------------- 소견기록 탭 ---------------- */}
      {mode === "findings" ? (
        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden max-h-[560px] overflow-y-auto">
            {findings.length === 0 ? (
              <p className="text-xs text-gray-400 text-center p-6">저장된 소견이 없습니다.</p>
            ) : (
              findings.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFindingId(f.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 transition-colors cursor-pointer ${
                    selectedFindingId === f.id ? "bg-indigo-50" : "hover:bg-gray-50"
                  }`}
                >
                  <p className="text-xs font-medium text-gray-800">{MODE_LABEL[f.mode]} 소견</p>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(f.savedAt).toLocaleString("ko-KR")}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">주석 {f.strokes.length}개</p>
                </button>
              ))
            )}
          </div>

          <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-200" style={{ height: 560 }}>
            {selectedFinding ? (
              <>
                <img
                  src={
                    (selectedFinding.mode === "original" ? caseData.slide_thumbnail_url : caseData.heatmap_url) as string
                  }
                  alt={MODE_LABEL[selectedFinding.mode]}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
                {selectedFinding.mode === "overlay" && hasOriginal && (
                  <img
                    src={caseData.slide_thumbnail_url as string}
                    alt="원본"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    draggable={false}
                    style={{ zIndex: -1 }}
                  />
                )}
                <Stage width={stageSize.w} height={560} className="absolute inset-0">
                  <Layer listening={false}>
                    {selectedFinding.strokes.map((s, i) => (
                      <Line
                        key={i}
                        points={s.points.flatMap((p) => [p.x, p.y])}
                        stroke={s.color}
                        strokeWidth={s.size}
                        lineCap="round"
                        lineJoin="round"
                        tension={0.3}
                        globalCompositeOperation={s.composite ?? "source-over"}
                      />
                    ))}
                  </Layer>
                </Stage>
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => deleteFinding(selectedFinding.id)}
                    className="px-2 py-1 rounded bg-black/60 text-white text-[11px] hover:bg-rose-600 transition-colors cursor-pointer"
                  >
                    삭제
                  </button>
                </div>
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium">
                  {MODE_LABEL[selectedFinding.mode]} · {new Date(selectedFinding.savedAt).toLocaleDateString("ko-KR")}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                왼쪽 목록에서 소견을 선택하세요.
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 이미지 영역 */}
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-200 select-none"
            style={{ height: 560, cursor: !canDraw || tool === "move" ? "grab" : "crosshair" }}
          >
            <TransformWrapper
              ref={transformRef}
              minScale={1}
              maxScale={8}
              initialScale={1}
              panning={{ disabled: canDraw && tool !== "move" }}
              doubleClick={{ disabled: true }}
              onTransform={(_ref: ReactZoomPanPinchRef, state: { scale: number; positionX: number; positionY: number }) =>
  setZoomPct(state.scale)
}
            >
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
                <div className="relative w-full h-full">
                  {/* split 모드 — 원본 | 히트맵 */}
                  {mode === "split" && hasOriginal && hasHeatmap && (
                    <div className="flex h-full w-full">
                      <div className="relative flex-1 overflow-hidden border-r border-white/10">
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
                      <div className="relative flex-1 overflow-hidden">
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

                  {/* overlay 모드 */}
                  {mode === "overlay" && hasOriginal && hasHeatmap && (
                    <div className="relative h-full w-full">
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
                  {mode === "heatmap" && hasHeatmap && (
                    <div className="relative h-full w-full">
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
                    <div className="relative h-full w-full">
                      <img
                        src={caseData.slide_thumbnail_url as string}
                        alt="원본"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        draggable={false}
                      />
                    </div>
                  )}

                  {/* 드로잉 스테이지 — heatmap/overlay/original 모드에서만 */}
                  {canDraw && (
                   <Stage
                          width={stageSize.w}
                          height={stageSize.h}
                          className="absolute inset-0"
                          style={{ touchAction: "none" }}
                          onMouseDown={handleStageDown}
                          onMouseMove={handleStageMove}
                          onMouseUp={handleStageUp}
                          onMouseLeave={handleStageUp}
                          onTouchStart={handleStageDown}
                          onTouchMove={handleStageMove}
                          onTouchEnd={handleStageUp}
>
                      <Layer listening={false} opacity={showAnnotations ? 1 : 0}>
                        {strokes.map((s, i) => (
                          <Line
                            key={i}
                            points={s.points.flatMap((p) => [p.x, p.y])}
                            stroke={s.color}
                            strokeWidth={s.size}
                            lineCap="round"
                            lineJoin="round"
                            tension={0.3}
                            globalCompositeOperation={s.composite ?? "source-over"}
                          />
                        ))}
                        {isDrawing.current && currentPoints.current.length > 1 && drawTick >= 0 && (
                          <Line
                            points={currentPoints.current.flatMap((p) => [p.x, p.y])}
                            stroke={tool === "eraser" ? "#000000" : color}
                            strokeWidth={tool === "eraser" ? brushSize * 6 : brushSize}
                            lineCap="round"
                            lineJoin="round"
                            tension={0.3}
                            globalCompositeOperation={tool === "eraser" ? "destination-out" : "source-over"}
                          />
                        )}
                      </Layer>
                    </Stage>
                  )}
                </div>
              </TransformComponent>
            </TransformWrapper>

            {/* 우측 하단 — 줌 표시 */}
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[11px] tabular-nums pointer-events-none">
              {Math.round(zoomPct * 100)}%
            </div>
          </div>

          {/* 안내 문구 */}
          <p className="text-xs text-gray-400 leading-relaxed">
            {canDraw ? (
              <>
                <span className="text-gray-500 font-medium">사용법:</span>{" "}
                휠/핀치로 확대·축소 · 이동 도구로 드래그 · 펜으로 주석 · 지우개로 삭제 · 탭 전환 시 화면이 초기화됩니다
                {strokes.length > 0 && <span className="ml-2 text-teal-600">· 주석 {strokes.length}개</span>}
              </>
            ) : (
              "휠/핀치로 확대·축소, 드래그로 이동할 수 있습니다."
            )}
          </p>
        </>
      )}
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
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
        active ? "bg-teal-600 text-white shadow-sm" : "text-gray-600 hover:bg-white"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
