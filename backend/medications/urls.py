from django.urls import path

from . import views

urlpatterns = [
    path('pending-setup/', views.pending_setup_patients, name='medication-pending-setup'),
    path("schedules/", views.create_schedule, name="medication-schedule-create"),
    path("logs/today/", views.today_logs, name="medication-logs-today"),
    path("reminders/", views.send_medication_reminder, name="medication-reminder-send"),
    path("logs/<uuid:log_id>/taken/", views.mark_taken, name="medication-log-taken"),
    path("logs/compliance/monthly/", views.monthly_compliance, name="medication-compliance-monthly"),
    path("logs/compliance/<uuid:patient_id>/", views.patient_compliance_summary, name="medication-compliance-patient"),
]
