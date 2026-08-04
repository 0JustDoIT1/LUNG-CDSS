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
