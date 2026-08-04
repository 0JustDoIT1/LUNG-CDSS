export type CaseStatus =
  | "uploaded"
  | "processing"
  | "pending_review"
  | "confirmed"
  | "failed";

export type CaseStep =
  | "uploaded"
  | "preprocessing"
  | "feature_extraction"
  | "classification"
  | "nuclei_detection"
  | "generating_result"
  | null;

export type PredictionLabel = "LUAD" | "LUSC" | null;
export type DensityLevel = "낮음" | "보통" | "높음" | null;
export type IrregularityLevel = "낮음" | "보통" | "뚜렷" | null;
export type GeneName = "TP53" | "KEAP1" | "KRAS";

export interface NucleiPatch {
  id: string;
  original_url: string;
  overlay_url: string;
  nuclei_count: number;
  attention_rank: number;
}

export interface GenePrediction {
  gene_name: GeneName;
  likelihood: number;
}

export interface AIAnalysisResult {
  id: string;
  model_version: string;
  prediction_label: PredictionLabel;
  luad_probability: number | null;
  lusc_probability: number | null;
  nuclei_density_score: number | null;
  nuclei_density_level: DensityLevel;
  nuclei_irregularity_score: number | null;
  nuclei_irregularity_level: IrregularityLevel;
  heatmap_url: string | null;
  nuclei_patches: NucleiPatch[];
  gene_predictions: GenePrediction[];
  treatment_note: string | null;
  created_at: string;
}

export interface ConfirmedFinding {
  final_subtype: "LUAD" | "LUSC";
  final_note: string;
  confirmed_by_name: string;
  confirmed_at: string;
}

export interface CaseListItem {
  id: string;
  specimen_id: string;
  status: CaseStatus;
  patient_name?: string;
  prediction_label: PredictionLabel;
  luad_probability: number | null;
  lusc_probability: number | null;
  uploaded_at: string;
  completed_at: string | null;
  is_confirmed: boolean;
  is_favorite: boolean;
}

export interface CaseDetail {
  id: string;
  specimen_id: string;
  status: CaseStatus;
  current_step: CaseStep;
  patient_name?: string;
  prediction_label: PredictionLabel;
  luad_probability: number | null;
  lusc_probability: number | null;
  nuclei_density_score: number | null;
  nuclei_density_level: DensityLevel;
  nuclei_irregularity_score: number | null;
  nuclei_irregularity_level: IrregularityLevel;
  heatmap_url: string | null;
  slide_thumbnail_url: string | null;
  nuclei_patches: NucleiPatch[];
  gene_predictions: GenePrediction[];
  treatment_note: string | null;
  uploaded_at: string;
  analyzed_at: string | null;
  completed_at: string | null;
  latest_ai_result: AIAnalysisResult | null;
  confirmed_finding: ConfirmedFinding | null;
  is_favorite: boolean;
}

export interface CaseListParams {
  status?: CaseStatus;
  label?: PredictionLabel;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface CreateCasePayload {
  specimen_id: string;
  slide_gcs_path: string;
  patient_id: string;
}

export interface PatientOption {
  id: string;
  name: string;
}

export interface UploadUrlPayload {
  filename: string;
}

export interface UploadUrlResponse {
  upload_url: string;
  gcs_path: string;
}

export interface ReviewPayload {
  action: "confirm" | "edit";
  final_subtype?: "LUAD" | "LUSC";
  final_note?: string;
}

export interface CaseReviewLog {
  id: string;
  action: "confirmed" | "edited";
  subtype_at_time: "LUAD" | "LUSC";
  note_at_time: string;
  reviewer_name: string;
  created_at: string;
}

export interface CaseFinding {
  id: string;
  mode: "heatmap" | "overlay" | "original";
  strokes: Stroke[];
  created_at: string;
}

export interface CreateCaseFindingPayload {
  mode: CaseFinding["mode"];
  strokes: Stroke[];
}

export interface Metrics {
  total: number;
  completed: number;
  failed: number;
  review: number;
}

export interface Stroke {
  color: string;
  size: number;
  points: { x: number; y: number }[];
  composite?: "source-over" | "destination-out";
}

export const STATUS_LABELS: Record<CaseStatus, string> = {
  uploaded: "업로드됨",
  processing: "분석 중",
  pending_review: "검토 대기",
  confirmed: "확정",
  failed: "실패",
};

export const STATUS_CLS: Record<CaseStatus, string> = {
  uploaded: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  pending_review: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  failed: "bg-rose-100 text-rose-700",
};

