export type DepartmentCode = "respiratory" | "pathology" | "oncology";
export type UserRole = "doctor" | "pathologist";

export interface SignupPayload {
  hospital_code: string;
  username: string;
  name: string;
  department: DepartmentCode;
  role: UserRole;
  password: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenPair {
  access: string;
  refresh: string;
}