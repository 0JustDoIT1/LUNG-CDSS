from django.urls import path

from . import views

urlpatterns = [
    path("patients/<uuid:patient_id>/", views.patient_detail, name="clinical-patient-detail"),
    path("patients/<uuid:patient_id>/notes/", views.clinical_notes, name="clinical-notes"),
    path("patients/<uuid:patient_id>/prescriptions/", views.prescriptions, name="clinical-prescriptions"),
    path("audit-logs/", views.audit_logs, name="clinical-audit-logs"),
]
