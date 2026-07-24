import apiClient from "./client";
import type {
  CaseDetail,
  CaseListItem,
  CaseListParams,
  CreateCasePayload,
  ReviewPayload,
} from "../types/case";

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