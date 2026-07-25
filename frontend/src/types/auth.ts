export type DepartmentCode = "pathology" | "pulmonology" | "oncology";
export type UserRole = "doctor" | "pathologist";

export interface SignupPayload {
  hospital_code: string;
  name: string;
  department: DepartmentCode;
  role: UserRole;
  password: string;
}

export interface LoginPayload {
  hospital_code: string;
  password: string;
}

export interface TokenPair {
  access: string;
  refresh: string;
}