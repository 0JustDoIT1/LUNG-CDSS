import apiClient, { setTokens, clearTokens } from "./client";
import type { SignupPayload, LoginPayload, LoginResponse } from "../types/auth";

export async function signup(payload: SignupPayload) {
  const { data } = await apiClient.post("/auth/signup/", payload);
  return data;
}

export async function login(payload: LoginPayload) {
  const { data } = await apiClient.post<LoginResponse>("/auth/login/", payload);
  setTokens(data.access, data.refresh);
  localStorage.setItem("user_name", data.name);
  localStorage.setItem("user_department", data.department);
  localStorage.setItem("user_role", data.role);
  return data;
}

export function logout() {
  clearTokens();
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_department");
  localStorage.removeItem("user_role");
}