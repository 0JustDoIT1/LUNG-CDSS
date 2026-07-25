import apiClient from "./client";
import type {
  CaseDetail,
  CaseListItem,
  CaseListParams,
  CreateCasePayload,
  ReviewPayload,
  UploadUrlPayload,
  UploadUrlResponse,
} from "../types/case";

// 1. 업로드 URL 발급
export async function getUploadUrl(payload: UploadUrlPayload) {
  const { data } = await apiClient.post<UploadUrlResponse>("/cases/upload-url/", payload);
  return data;
}

// 2. 발급받은 URL로 파일 직접 GCS 업로드 (Django 안 거침)
export async function uploadFileToGcs(uploadUrl: string, file: File) {
  await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

export async function getCases(params?: CaseListParams) {
  const { data } = await apiClient.get<CaseListItem[]>("/cases/", { params });
  return data;
}

export async function getCase(id: string) {
  const { data } = await apiClient.get<CaseDetail>(`/cases/${id}/`);
  return data;
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