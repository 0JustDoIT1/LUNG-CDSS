export type DepartmentCode = "pathology" | "pulmonology" | "oncology";
export type UserRole = "doctor" | "nurse" | "pathologist";

export interface SignupPayload {
  hospital_id: string;
  name: string;
  email: string;
  phone_number: string;
  department: DepartmentCode;
  role: UserRole;
  password: string;
  password_confirm: string;
  license_number?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface LoginResponse extends TokenPair {
  name: string;
  department?: DepartmentCode;
  role: UserRole;
}

export interface Hospital {
  id: string;
  name: string;
}
