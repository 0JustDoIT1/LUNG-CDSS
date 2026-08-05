export type ScheduleDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export type SchedulePeriod = "am" | "pm";

export interface WeeklyScheduleEntry {
  day_of_week: ScheduleDay;
  period: SchedulePeriod;
  available: boolean;
}

export interface DoctorOffDay {
  id: string;
  date: string;
  reason: string;
}

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "reminded_d7"
  | "reminded_d1"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";

export interface DoctorAppointment {
  id: string;
  patient_name: string;
  doctor_name: string;
  department: string;
  requested_at_slot: string;
  confirmed_slot: string | null;
  status: AppointmentStatus;
  created_at: string;
}
