import apiClient, { setTokens, clearTokens } from "./client";
import type { SignupPayload, LoginPayload, TokenPair } from "../types/auth";

export async function signup(payload: SignupPayload) {
  const { data } = await apiClient.post("/auth/signup/", payload);
  return data;
}

export async function login(payload: LoginPayload) {
  const { data } = await apiClient.post<TokenPair>("/auth/login/", payload);
  setTokens(data.access, data.refresh);
  return data;
}

export function logout() {
  clearTokens();
}