import apiClient from "./client";
import type {
  CaseDetail,
  CaseListItem,
  CaseListParams,
  CreateCasePayload,
  PatientOption,
  ReviewPayload,
  UploadUrlPayload,
  UploadUrlResponse,
} from "../types/case";

export interface PaginatedCaseResponse {
  count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  summary: {
    total: number;
    uploaded: number;
    completed: number;
    failed: number;
  };
  results: CaseListItem[];
}

// 1. 업로드 URL 발급
export async function getUploadUrl(payload: UploadUrlPayload) {
  const { data } = await apiClient.post<UploadUrlResponse>("/cases/upload-url/", payload);
  return data;
}

// 2. 발급받은 URL로 파일 직접 GCS 업로드
export async function uploadFileToGcs(uploadUrl: string, file: File) {
  await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

// 3. 케이스 목록 조회
export async function getCases(params?: CaseListParams) {
  const { data } = await apiClient.get<PaginatedCaseResponse>("/cases/", { params });
  return data;
}

export async function getCase(id: string) {
  const { data } = await apiClient.get<CaseDetail>(`/cases/${id}/`);
  const { latest_ai_result, ...caseData } = data;

  return {
    ...caseData,
    ...(latest_ai_result ?? {}),
    latest_ai_result,
  } as CaseDetail;
}

export async function createCase(payload: CreateCasePayload) {
  const { data } = await apiClient.post<CaseDetail>("/cases/", payload);
  return data;
}

export async function deleteCase(id: string) {
  await apiClient.delete(`/cases/${id}/`);
}

export async function predictCase(id: string) {
  const { data } = await apiClient.post(`/cases/${id}/predict/`);
  return data;
}

export async function retryCase(id: string) {
  const { data } = await apiClient.post(`/cases/${id}/retry/`);
  return data;
}

export async function reviewCase(id: string, payload: ReviewPayload) {
  const { data } = await apiClient.post(`/cases/${id}/review/`, payload);
  return data;
}

export async function getPatients() {
  const { data } = await apiClient.get<PatientOption[]>("/auth/staff/patients/");
  return data;
}
