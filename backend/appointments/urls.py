from django.urls import path

from . import views

urlpatterns = [
    path("departments/", views.department_list, name="appt-departments"),
    path("doctors/", views.doctor_list, name="appt-doctors"),
    path("doctors/<uuid:doctor_id>/slots/", views.available_slots, name="appt-slots"),
    path("", views.create_appointment, name="appt-create"),
    path("mine/", views.my_appointments, name="appt-mine"),
    path("doctor/mine/", views.doctor_my_appointments, name="appt-doctor-mine"),
    path("doctor/<uuid:appointment_id>/approve/", views.doctor_approve_appointment, name="appt-doctor-approve"),
    path("<uuid:appointment_id>/cancel/", views.cancel_appointment, name="appt-cancel"),

    path("queue/", views.request_queue, name="appt-queue"),
    path("<uuid:appointment_id>/process/", views.process_request, name="appt-process"),

    path("today-visits/", views.today_visits, name="appt-today-visits"),
    path("<uuid:appointment_id>/check-in/", views.check_in, name="appt-check-in"),
    path("<uuid:appointment_id>/no-show/", views.mark_no_show, name="appt-no-show"),

    path("doctor/off-days/", views.doctor_off_days, name="doctor-off-days"),
    path("doctor/off-days/<uuid:off_day_id>/", views.doctor_off_day_delete, name="doctor-off-day-delete"),
    path("doctor/weekly-schedule/", views.doctor_weekly_schedule, name="doctor-weekly-schedule"),
]
