import apiClient from "./client";
import type {
  CaseDetail,
  CaseFinding,
  CaseListItem,
  CaseListParams,
  CaseReviewLog,
  CreateCaseFindingPayload,
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
    pending_review: number;
    confirmed: number;
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
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!response.ok) {
    throw new Error(`GCS upload failed (${response.status})`);
  }
}

// 3. 케이스 목록 조회
export async function getCases(params?: CaseListParams) {
  const { data } = await apiClient.get<PaginatedCaseResponse>("/cases/", { params });
  return data;
}

export async function getAllCases(
  params?: Omit<CaseListParams, "page" | "page_size">,
) {
  const pageSize = 100;
  const firstPage = await getCases({ ...params, page: 1, page_size: pageSize });
  const results = [...firstPage.results];

  for (let page = 2; page <= firstPage.total_pages; page += 1) {
    const nextPage = await getCases({ ...params, page, page_size: pageSize });
    results.push(...nextPage.results);
  }

  return results;
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
  const { data } = await apiClient.post<CaseDetail>(`/cases/${id}/predict/`);
  return data;
}

export async function reviewCase(id: string, payload: ReviewPayload) {
  const { data } = await apiClient.post(`/cases/${id}/review/`, payload);
  return data;
}

export async function getCaseReviewLogs(id: string) {
  const { data } = await apiClient.get<CaseReviewLog[]>(`/cases/${id}/review-log/`);
  return data;
}

export async function getCaseFindings(id: string) {
  const { data } = await apiClient.get<CaseFinding[]>(`/cases/${id}/findings/`);
  return data;
}

export async function createCaseFinding(id: string, payload: CreateCaseFindingPayload) {
  const { data } = await apiClient.post<CaseFinding>(`/cases/${id}/findings/`, payload);
  return data;
}

export async function deleteCaseFinding(caseId: string, findingId: string) {
  await apiClient.delete(`/cases/${caseId}/findings/${findingId}/`);
}

export async function getPatients() {
  const { data } = await apiClient.get<PatientOption[]>("/auth/staff/patients/");
  return data;
}
