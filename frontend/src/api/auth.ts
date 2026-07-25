import apiClient, { setTokens, clearTokens } from "./client";
import type { SignupPayload, LoginPayload, LoginResponse } from "../types/auth";

export async function signup(payload: SignupPayload) {
  const { data } = await apiClient.post("/auth/signup/", payload);
  return data;
}

export async function login(payload: LoginPayload) {
  const { data } = await apiClient.post<LoginResponse>("/auth/login/", payload);
  setTokens(data.access, data.refresh);
  return data; // name, department, role 포함 — 로그인 성공 후 화면에서 이 값 활용
}

export function logout() {
  clearTokens();
}