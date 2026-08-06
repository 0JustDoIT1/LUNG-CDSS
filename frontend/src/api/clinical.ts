import apiClient from "./client";

export interface PatientClinicalDetail {
  id: string; name: string; patient_number: string | null; birth_date: string | null; gender: string | null;
  cases: Array<{ id: string; specimen_id: string; status: string; uploaded_at: string }>;
  appointments: Array<{ id: string; requested_at_slot: string; confirmed_slot: string | null; status: string; department: string }>;
  medications: Array<{ id: string; drug_name: string; dosage: string; start_date: string; end_date: string | null }>;
}
export interface ClinicalNote { id: string; content: string; doctor_name: string; created_at: string; }
export interface Prescription { id: string; medication_name: string; dosage: string; instructions: string; start_date: string; end_date: string | null; status: string; doctor_name: string; created_at: string; }
export interface AuditLog { id: string; actor_name: string; action: string; resource_type: string; metadata: Record<string, unknown>; created_at: string; }

export const getPatientClinicalDetail = async (id: string) => (await apiClient.get<PatientClinicalDetail>(`/clinical/patients/${id}/`)).data;
export const getClinicalNotes = async (id: string) => (await apiClient.get<ClinicalNote[]>(`/clinical/patients/${id}/notes/`)).data;
export const createClinicalNote = async (id: string, content: string) => (await apiClient.post<ClinicalNote>(`/clinical/patients/${id}/notes/`, { content })).data;
export const getPrescriptions = async (id: string) => (await apiClient.get<Prescription[]>(`/clinical/patients/${id}/prescriptions/`)).data;
export const createPrescription = async (id: string, payload: Omit<Prescription, "id" | "doctor_name" | "created_at">) => (await apiClient.post<Prescription>(`/clinical/patients/${id}/prescriptions/`, payload)).data;
export const requestCaseReanalysis = async (caseId: string, reason: string) => (await apiClient.post(`/cases/${caseId}/reanalysis-requests/`, { reason })).data;
export const getPatientAuditLogs = async (patientId: string) => (await apiClient.get<AuditLog[]>("/clinical/audit-logs/", { params: { patient_id: patientId } })).data;
