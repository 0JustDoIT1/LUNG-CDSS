import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  approveDoctorAppointment,
  createDoctorOffDay,
  deleteDoctorOffDay,
  getDoctorAppointments,
  getDoctorOffDays,
  getDoctorWeeklySchedule,
  updateDoctorWeeklySchedule,
} from "../api/appointments";
import Header from "../components/Shared/Header";
import type { DoctorAppointment, DoctorOffDay, ScheduleDay, SchedulePeriod, WeeklyScheduleEntry } from "../types/appointment";

const APPOINTMENT_STATUS_LABEL: Record<DoctorAppointment["status"], string> = {
  requested: "승인 대기",
  confirmed: "예약 확정",
  reminded_d7: "예약 확정",
  reminded_d1: "예약 확정",
  checked_in: "접수 완료",
  completed: "진료 완료",
  cancelled: "취소",
  no_show: "미방문",
};

const DAYS: Array<{ value: ScheduleDay; label: string }> = [
  { value: "mon", label: "월" },
  { value: "tue", label: "화" },
  { value: "wed", label: "수" },
  { value: "thu", label: "목" },
  { value: "fri", label: "금" },
  { value: "sat", label: "토" },
];
const PERIODS: Array<{ value: SchedulePeriod; label: string }> = [
  { value: "am", label: "오전" },
  { value: "pm", label: "오후" },
];
const CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function OffDayDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }): React.JSX.Element {
  const selectedDate = parseDateValue(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = selectedDate ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const calendarDates = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1 - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    );
  }, [viewMonth]);

  const todayValue = toDateValue(new Date());

  function selectDate(nextDate: Date): void {
    onChange(toDateValue(nextDate));
    setViewMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setOpen(false);
  }

  function selectToday(): void {
    const today = new Date();
    selectDate(today);
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1.5 block text-xs font-medium text-gray-600">휴진 날짜</label>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open && selectedDate) setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
          setOpen((current) => !current);
        }}
        className={`flex w-full items-center justify-between rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm transition ${
          open
            ? "border-teal-500 ring-2 ring-teal-100"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className={selectedDate ? "font-medium text-gray-800" : "text-gray-400"}>
          {selectedDate
            ? selectedDate.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
            : "날짜를 선택하세요"}
        </span>
        <CalendarDays className={`h-4 w-4 ${open ? "text-teal-600" : "text-gray-400"}`} />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="휴진 날짜 선택"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl"
        >
          <div className="flex items-center justify-between px-1 pb-3">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-gray-900">
              {viewMonth.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
            </p>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center">
            {CALENDAR_WEEKDAYS.map((weekday, index) => (
              <span
                key={weekday}
                className={`py-1.5 text-[11px] font-medium ${
                  index === 0 ? "text-rose-500" : index === 6 ? "text-blue-500" : "text-gray-400"
                }`}
              >
                {weekday}
              </span>
            ))}
            {calendarDates.map((calendarDate) => {
              const dateValue = toDateValue(calendarDate);
              const inCurrentMonth = calendarDate.getMonth() === viewMonth.getMonth();
              const isSelected = dateValue === value;
              const isToday = dateValue === todayValue;
              const weekday = calendarDate.getDay();
              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={calendarDate.toLocaleDateString("ko-KR")}
                  aria-pressed={isSelected}
                  onClick={() => selectDate(calendarDate)}
                  className={`mx-auto my-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                    isSelected
                      ? "bg-teal-600 text-white shadow-sm"
                      : isToday
                        ? "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200"
                        : !inCurrentMonth
                          ? "text-gray-300 hover:bg-gray-50"
                          : weekday === 0
                            ? "text-rose-500 hover:bg-rose-50"
                            : weekday === 6
                              ? "text-blue-500 hover:bg-blue-50"
                              : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {calendarDate.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-gray-100 px-1 pt-3">
            <span className="text-[11px] text-gray-400">휴진할 날짜를 선택하세요</span>
            <button type="button" onClick={selectToday} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">
              오늘
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function emptySchedule(): WeeklyScheduleEntry[] {
  return DAYS.flatMap((day) => PERIODS.map((period) => ({ day_of_week: day.value, period: period.value, available: false })));
}

export default function DoctorSchedulePage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const selectedAppointmentId = searchParams.get("appointment");
  const [schedule, setSchedule] = useState<WeeklyScheduleEntry[]>(emptySchedule);
  const [offDays, setOffDays] = useState<DoctorOffDay[]>([]);
  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getDoctorWeeklySchedule(), getDoctorOffDays(), getDoctorAppointments()])
      .then(([scheduleData, offDayData, appointmentData]) => {
        if (!active) return;
        const loaded = emptySchedule().map((entry) => {
          const saved = scheduleData.find((item) => item.day_of_week === entry.day_of_week && item.period === entry.period);
          return saved ?? entry;
        });
        setSchedule(loaded);
        setOffDays(offDayData);
        setAppointments(appointmentData);
      })
      .catch(() => {
        if (active) setError("진료 일정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const scheduleMap = useMemo(
    () => new Map(schedule.map((entry) => [`${entry.day_of_week}:${entry.period}`, entry.available])),
    [schedule]
  );

  function toggleSlot(day: ScheduleDay, period: SchedulePeriod): void {
    setSchedule((current) => current.map((entry) =>
      entry.day_of_week === day && entry.period === period ? { ...entry, available: !entry.available } : entry
    ));
    setMessage(null);
  }

  async function saveSchedule(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateDoctorWeeklySchedule(schedule);
      const normalized = emptySchedule().map((entry) =>
        updated.find((item) => item.day_of_week === entry.day_of_week && item.period === entry.period) ?? entry
      );
      setSchedule(normalized);
      setMessage("주간 진료 일정이 저장되었습니다.");
    } catch {
      setError("주간 일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function addOffDay(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!date) return;
    setError(null);
    try {
      const created = await createDoctorOffDay({ date, reason: reason.trim() });
      setOffDays((current) => [...current, created].sort((a, b) => a.date.localeCompare(b.date)));
      setDate("");
      setReason("");
    } catch {
      setError("휴진일을 등록하지 못했습니다.");
    }
  }

  async function removeOffDay(id: string): Promise<void> {
    setError(null);
    try {
      await deleteDoctorOffDay(id);
      setOffDays((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("휴진일을 삭제하지 못했습니다.");
    }
  }

  async function approveAppointment(id: string): Promise<void> {
    setApprovingId(id);
    setError(null);
    setMessage(null);
    try {
      const updated = await approveDoctorAppointment(id);
      setAppointments((current) => current.map((item) => item.id === id ? updated : item));
      setMessage(`${updated.patient_name}님의 예약을 승인했습니다.`);
    } catch {
      setError("예약을 승인하지 못했습니다. 예약 상태를 다시 확인해주세요.");
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <Header />
      <main className="mx-auto w-full max-w-6xl p-4 lg:p-6">
        <div className="mb-5">
          <p className="text-xs font-medium text-teal-600">진료 가능 시간 관리</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">주간 일정 및 휴진일</h1>
          <p className="mt-1 text-sm text-gray-500">환자 예약에 공개할 정기 진료 시간과 예외 휴진일을 설정합니다.</p>
        </div>

        {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="mb-4 rounded-lg bg-teal-50 px-4 py-2.5 text-sm text-teal-700">{message}</p> : null}

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-gray-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
        ) : (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-5 py-4">
                <CalendarClock className="h-4 w-4 text-teal-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">예약 신청 목록</h2>
                  <p className="mt-1 text-xs text-gray-500">환자가 신청한 예약 시간과 처리 상태입니다.</p>
                </div>
              </div>
              <div className="p-5">
                {appointments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">예약 신청이 없습니다.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {appointments.map((appointment) => {
                      const selected = appointment.id === selectedAppointmentId;
                      const appointmentAt = appointment.confirmed_slot ?? appointment.requested_at_slot;
                      return (
                        <article
                          key={appointment.id}
                          id={`appointment-${appointment.id}`}
                          className={`rounded-xl border p-4 transition ${
                            selected
                              ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{appointment.patient_name}</p>
                              <p className="mt-1 text-xs text-gray-500">{appointment.department}</p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              appointment.status === "requested"
                                ? "bg-amber-100 text-amber-700"
                                : appointment.status === "cancelled" || appointment.status === "no_show"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-teal-100 text-teal-700"
                            }`}>
                              {APPOINTMENT_STATUS_LABEL[appointment.status]}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-medium text-gray-700">
                            {new Date(appointmentAt).toLocaleString("ko-KR", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              weekday: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="mt-2 text-[11px] text-gray-400">
                            신청 {new Date(appointment.created_at).toLocaleString("ko-KR")}
                          </p>
                          {appointment.status === "requested" ? (
                            <button
                              type="button"
                              onClick={() => void approveAppointment(appointment.id)}
                              disabled={approvingId !== null}
                              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
                            >
                              {approvingId === appointment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              {approvingId === appointment.id ? "승인 처리 중..." : "예약 승인"}
                            </button>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-4">
                <h2 className="text-sm font-semibold text-gray-900">주간 진료 일정</h2>
                <p className="mt-1 text-xs text-gray-500">진료 가능한 시간대를 선택하세요.</p>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-[70px_repeat(6,minmax(54px,1fr))] gap-2 text-center">
                  <div />
                  {DAYS.map((day) => <div key={day.value} className="py-2 text-xs font-semibold text-gray-600">{day.label}</div>)}
                  {PERIODS.map((period) => (
                    <div key={period.value} className="contents">
                      <div className="flex items-center text-xs font-medium text-gray-500">{period.label}</div>
                      {DAYS.map((day) => {
                        const selected = scheduleMap.get(`${day.value}:${period.value}`) ?? false;
                        return (
                          <button
                            key={`${day.value}:${period.value}`}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleSlot(day.value, period.value)}
                            className={`rounded-xl border px-2 py-4 text-xs font-semibold transition ${selected ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"}`}
                          >
                            {selected ? "진료" : "휴무"}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={() => void saveSchedule()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "저장 중..." : "주간 일정 저장"}
                  </button>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><CalendarDays className="h-4 w-4 text-teal-600" /> 휴진일</h2>
                <p className="mt-1 text-xs text-gray-500">정기 일정과 별개로 쉬는 날짜를 등록합니다.</p>
              </div>
              <div className="p-5">
                <form onSubmit={(event) => void addOffDay(event)} className="space-y-3 rounded-xl bg-gray-50 p-3.5">
                  <OffDayDatePicker value={date} onChange={setDate} />
                  <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={100} placeholder="휴진 사유 (선택)" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500" />
                  <button type="submit" disabled={!date} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"><Plus className="h-4 w-4" /> 휴진일 추가</button>
                </form>

                <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                  {offDays.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">등록된 휴진일이 없습니다.</p>
                  ) : offDays.map((offDay) => (
                    <div key={offDay.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{new Date(`${offDay.date}T00:00:00`).toLocaleDateString("ko-KR")}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{offDay.reason || "사유 없음"}</p>
                      </div>
                      <button type="button" onClick={() => void removeOffDay(offDay.id)} aria-label="휴진일 삭제" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
          </div>
        )}
      </main>
    </div>
  );
}
