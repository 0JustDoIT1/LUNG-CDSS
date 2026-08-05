import apiClient from "./client";
import type { DoctorAppointment, DoctorOffDay, WeeklyScheduleEntry } from "../types/appointment";

export async function getDoctorAppointments() {
  const { data } = await apiClient.get<DoctorAppointment[]>("/appointments/doctor/mine/");
  return data;
}

export async function approveDoctorAppointment(id: string) {
  const { data } = await apiClient.post<DoctorAppointment>(`/appointments/doctor/${id}/approve/`);
  return data;
}

export async function getDoctorWeeklySchedule() {
  const { data } = await apiClient.get<WeeklyScheduleEntry[]>("/appointments/doctor/weekly-schedule/");
  return data;
}

export async function updateDoctorWeeklySchedule(entries: WeeklyScheduleEntry[]) {
  const { data } = await apiClient.put<WeeklyScheduleEntry[]>("/appointments/doctor/weekly-schedule/", entries);
  return data;
}

export async function getDoctorOffDays() {
  const { data } = await apiClient.get<DoctorOffDay[]>("/appointments/doctor/off-days/");
  return data;
}

export async function createDoctorOffDay(payload: Pick<DoctorOffDay, "date" | "reason">) {
  const { data } = await apiClient.post<DoctorOffDay>("/appointments/doctor/off-days/", payload);
  return data;
}

export async function deleteDoctorOffDay(id: string) {
  await apiClient.delete(`/appointments/doctor/off-days/${id}/`);
}
