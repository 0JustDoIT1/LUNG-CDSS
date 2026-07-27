import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import { getUploadUrl, uploadFileToGcs, createCase } from "../api/cases";
import { createSvsPreview } from "../utils/createSvsPreview";

const ALLOWED_EXT = ["svs", "ndpi", "tiff", "tif", "png", "jpg", "jpeg"];
const PREVIEWABLE_EXT = ["png", "jpg", "jpeg"];
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB


type FileStatus = "ready" | "error" | "uploading" | "done";

interface QueuedFile {
  file: File;
  status: FileStatus;
  error?: string;
  progress: number;
  previewUrl?: string;
}

type Stage = "select" | "processing" | "complete";

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function fmtSize(bytes: number) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(0) + " KB";
}

const STEPS = [
  { label: "파일 선택" },
  { label: "업로드" },
  { label: "분석 준비" },
];

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [specimenId, setSpecimenId] = useState("");
  const [stage, setStage] = useState<Stage>("select");
  const [stepIndex, setStepIndex] = useState(0);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [valMsg, setValMsg] = useState<string | null>(null);
  const [globalProgress, setGlobalProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [hourglassRotation, setHourglassRotation] = useState(0);

  const hasReadyFile = files.some((f) => f.status === "ready");

 const addFiles = useCallback(async (fileList: FileList) => {
  setValMsg(null);

  let hasError = false;

  const newFiles: QueuedFile[] = await Promise.all(
    Array.from(fileList).map(async (file) => {
      const extension = ext(file.name);
      let previewUrl: string | undefined;

      if (!ALLOWED_EXT.includes(extension)) {
        hasError = true;

        return {
          file,
          status: "error" as const,
          error: "지원하지 않는 파일 형식",
          progress: 0,
        };
      }

      if (file.size > MAX_SIZE) {
        hasError = true;

        return {
          file,
          status: "error" as const,
          error: "파일 크기 초과 (최대 2GB)",
          progress: 0,
        };
      }

      try {
        if (PREVIEWABLE_EXT.includes(extension)) {
          previewUrl = URL.createObjectURL(file);
        } else if (["svs", "tif", "tiff"].includes(extension)) {
          previewUrl = await createSvsPreview(file);
        }
      } catch (error) {
        console.error("슬라이드 미리보기 생성 실패:", error);

        return {
          file,
          status: "ready" as const,
          error: "미리보기 생성 실패",
          progress: 0,
        };
      }

      return {
        file,
        status: "ready" as const,
        progress: 0,
        previewUrl,
      };
    }),
  );

  setFiles((prev) => [...prev, ...newFiles]);

  if (hasError) {
    setValMsg("일부 파일이 요구 사항을 충족하지 않습니다.");
  }
}, []);

  function handleRemove(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    const target = files.find((f) => f.status === "ready");
    if (!target || !specimenId) {
      setSubmitError("검체 ID와 파일을 확인해주세요.");
      return;
    }

    setSubmitError(null);
    setStage("processing");
    setStepIndex(1);

    try {
      const { upload_url, gcs_path } = await getUploadUrl({ filename: target.file.name });

      setFiles((prev) => prev.map((f) => (f === target ? { ...f, status: "uploading" } : f)));
      setGlobalProgress(30);
      await uploadFileToGcs(upload_url, target.file);
      setGlobalProgress(70);
      setFiles((prev) => prev.map((f) => (f === target ? { ...f, status: "done", progress: 100 } : f)));

      const created = await createCase({ specimen_id: specimenId, slide_gcs_path: gcs_path });
      setCreatedCaseId(created.id);
      setGlobalProgress(100);
      setStepIndex(2);
      setStage("complete");
    } catch (err: any) {
      const responseData = err?.response?.data;
      const message = responseData?.error;
      if (message) {
        setSubmitError(message);
      } else {
        setSubmitError("업로드 중 문제가 발생했습니다. 다시 시도해주세요.");
      }
      setStage("select");
      setFiles((prev) =>
        prev.map((f) => (f === target ? { ...f, status: "error", error: "업로드 실패" } : f))
      );
    }
  }
  useEffect(() => {
    if (stage !== "processing") return;
    const interval = setInterval(() => {
      setHourglassRotation((prev) => prev + 180);
    }, 1500); // 1.5초마다 180도씩 회전
    return () => clearInterval(interval);
  }, [stage]);  

  return (
    <div>
      <header className="mb-6">
        <p className="text-xs text-gray-400 tracking-wider">업로드 워크플로우</p>
        <h1 className="font-semibold text-2xl text-gray-900 tracking-tight">슬라이드 업로드</h1>
        <p className="text-[13px] text-gray-500 mt-1.5">분석을 위한 슬라이드를 준비하고 업로드합니다.</p>
      </header>

      {/* Step indicator */}
      <div className="flex items-center mb-7">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 text-xs ${
                i === stepIndex
                  ? "text-teal-600 font-semibold"
                  : i < stepIndex
                  ? "text-green-700 font-medium"
                  : "text-gray-400"
              }`}
            >
              <span
                className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${
                  i === stepIndex
                    ? "border-teal-500 bg-teal-50 text-teal-600"
                    : i < stepIndex
                    ? "border-green-700 bg-green-100 text-green-700"
                    : "border-gray-300 bg-white"
                }`}
              >
                {i + 1}
              </span>
              <span>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-2 ${i < stepIndex ? "bg-green-700" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>
      {stage === "select" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {/* 검체 ID */}
          <div className="mb-5 max-w-sm">
            <label htmlFor="specimen-id" className="block text-xs font-medium mb-1.5 text-gray-700">
              검체 ID
            </label>
            <input
              id="specimen-id"
              type="text"
              value={specimenId}
              onChange={(e) => setSpecimenId(e.target.value)}
              placeholder="예: TCGA-001"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100 transition"
            />
          </div>

          {/* Drop zone */}
          <label
            htmlFor="file-input"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`group flex flex-col items-center justify-center min-h-[200px] p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-colors hover:border-teal-500 hover:bg-teal-50/50 ${
              dragOver ? "bg-teal-50 border-teal-400" : "bg-[#f0fdfa] border-teal-600"
            }`}
          >
            <Upload className="w-8 h-8 mb-2.5 text-teal-600 group-hover:text-teal-500 transition-colors" />
            <p className="text-sm font-semibold text-teal-800 group-hover:text-teal-600 transition-colors mb-1">파일을 끌어다 놓거나 클릭하여 선택</p>
            <p className="text-xs text-slate-500">SVS, NDPI, TIFF, PNG, JPG 지원 · 최대 2GB</p>
            <p className="text-[11px] text-slate-400 mt-2.5">품질 검증을 위해 해상도 20x 이상 권장</p>
            <input
              ref={fileInputRef}
              id="file-input"
              type="file"
              multiple
              accept=".svs,.ndpi,.tiff,.tif,.png,.jpg,.jpeg"
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {valMsg && <p className="text-[11px] text-red-700 mt-1">{valMsg}</p>}

          {/* 원본 미리보기 (선택된 첫 이미지) */}
          {(() => {
            const previewFile = files.find((f) => f.previewUrl);
            if (!previewFile) return null;
            return (
              <div className="mt-5 border border-gray-200 rounded-2xl overflow-hidden bg-white">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-900">
                    {specimenId || "검체 ID 미입력"}
                  </span>
                </div>
                <div className="bg-gray-50 flex items-center justify-center p-4">
                  <img
                    src={previewFile.previewUrl}
                    alt={previewFile.file.name}
                    className="max-w-full max-h-[420px] rounded-lg object-contain"
                  />
                </div>
              </div>
            );
          })()}

          {/* File queue */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3.5 py-3 border rounded-lg bg-white ${
                    f.status === "error" ? "border-red-300 bg-red-50" : "border-gray-200"
                  }`}
                >
                  <div className="w-9 h-9 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-base text-gray-400">📄</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">{f.file.name}</div>
                    <div className="text-[11px] text-gray-400">{fmtSize(f.file.size)}</div>
                    {(f.status === "uploading" || f.status === "done") && (
                      <div className="w-full h-1 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      f.status === "ready"
                        ? "bg-[#eaf3de] text-[#27500a]"
                        : f.status === "uploading"
                        ? "bg-indigo-100 text-indigo-800"
                        : f.status === "done"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {f.status === "ready"
                      ? "준비"
                      : f.status === "uploading"
                      ? "업로드 중"
                      : f.status === "done"
                      ? "완료"
                      : f.error}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="text-gray-400 hover:text-gray-600 px-1"
                    aria-label="제거"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {submitError && <p className="text-xs text-red-500 mt-3">{submitError}</p>}

          <div className="flex gap-2.5 mt-5 flex-wrap">
            <button
              type="button"
              onClick={handleUpload}
              disabled={!hasReadyFile || !specimenId}
              className="px-4.5 py-2.5 rounded-lg text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 transition" 
            >
              업로드 시작
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4.5 py-2.5 rounded-lg text-[13px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-800 transition-all duration-200"
            >
              결과리스트로 돌아가기
            </button>

          </div>
        </div>
      )}

      {stage === "processing" && (
        <div className="text-center p-10 border border-teal-100 rounded-2xl bg-teal-50/40">
          <div className="h-12 flex items-center justify-center mb-3">
            <div
              className="text-4xl"
              style={{ transform: `rotate(${hourglassRotation}deg)`, transition: "transform 0.6s ease-in-out" }}
            >
              ⏳
            </div>
          </div>
          <p className="text-base font-semibold text-gray-900 mb-1.5">업로드 진행 중…</p>
          <p className="text-xs text-slate-500 mb-4">슬라이드를 분석 파이프라인에 등록하고 있습니다.</p>
          <div className="max-w-xs mx-auto h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${globalProgress}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-2.5">{globalProgress}%</p>
        </div>
      )}

      {stage === "complete" && (
        <div className="text-center p-10 border border-green-200 rounded-2xl bg-green-50">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-base font-semibold text-green-700 mb-1.5">업로드 완료 — 분석 준비됨</p>
          <p className="text-xs text-slate-500 mb-5">슬라이드가 성공적으로 등록되었습니다. 분석을 시작할 수 있습니다.</p>
          <div className="flex gap-2.5 justify-center flex-wrap">
            <button
              type="button"
              onClick={() => createdCaseId && navigate(`/analysis/${createdCaseId}`)}
              className="px-4.5 py-2.5 rounded-lg text-[13px] font-semibold bg-teal-600 text-white hover:bg-teal-700 transition"
            >
              분석 시작
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="px-4.5 py-2.5 rounded-lg text-[13px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
            >
              결과리스트로 이동
            </button>
          </div>
        </div>
      )}
    </div>
  );
}