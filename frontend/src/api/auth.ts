import apiClient, { setTokens, clearTokens } from "./client";
import type { Hospital, SignupPayload, LoginPayload, LoginResponse } from "../types/auth";
import { removeStoredItem, setStoredItem } from "../utils/storage";

export async function signup(payload: SignupPayload) {
  const { data } = await apiClient.post("/auth/staff/signup/", payload);
  return data;
}

export async function login(payload: LoginPayload) {
  const { data } = await apiClient.post<LoginResponse>("/auth/staff/login/", payload);
  setTokens(data.access, data.refresh);
  setStoredItem("user_name", data.name);
  if (data.department) setStoredItem("user_department", data.department);
  setStoredItem("user_role", data.role);
  return data;
}

export function logout() {
  clearTokens();
  removeStoredItem("user_name");
  removeStoredItem("user_department");
  removeStoredItem("user_role");
}

export async function getSignupHospital() {
  const { data } = await apiClient.get<Hospital>("/auth/hospital/");
  return data;
}
