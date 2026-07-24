export type CaseStatus = "uploaded" | "processing" | "completed" | "failed";

export type CaseStep =
  | "uploaded"
  | "preprocessing"
  | "feature_extraction"
  | "classification"
  | "nuclei_detection"
  | "generating_result"
  | null;

export type ReviewStatus = "ai_suggested" | "confirmed" | "overridden";
export type PredictionLabel = "LUAD" | "LUSC" | null;
export type DensityLevel = "낮음" | "보통" | "높음" | null;
export type IrregularityLevel = "낮음" | "보통" | "뚜렷" | null;

export interface NucleiPatch {
  id: string;
  original_gcs_path: string;
  overlay_gcs_path: string;
  nuclei_count: number;
  attention_rank: number;
}

export interface GenePrediction {
  id: string;
  gene_name: string;
  likelihood: number;
}

export interface CaseListItem {
  id: string;
  specimen_id: string;
  status: CaseStatus;
  prediction_label: PredictionLabel;
  uploaded_at: string;
}

export interface CaseDetail {
  id: string;
  specimen_id: string;
  status: CaseStatus;
  current_step: CaseStep;
  review_status: ReviewStatus;
  prediction_label: PredictionLabel;
  luad_probability: number | null;
  lusc_probability: number | null;
  nuclei_density_score: number | null;
  nuclei_density_level: DensityLevel;
  nuclei_irregularity_score: number | null;
  nuclei_irregularity_level: IrregularityLevel;
  heatmap_gcs_path: string | null;
  slide_thumbnail_gcs_path: string | null;
  nuclei_patches: NucleiPatch[];
  gene_predictions: GenePrediction[];
  treatment_note: string | null;
  uploaded_at: string;
  analyzed_at: string | null;
  completed_at: string | null;
}

export interface CaseListParams {
  status?: CaseStatus;
  label?: PredictionLabel;
  search?: string;
}

export interface CreateCasePayload {
  specimen_id: string;
  slide_gcs_path: string;
}

export interface ReviewPayload {
  action: "confirm" | "override";
  reviewer_note?: string;
}