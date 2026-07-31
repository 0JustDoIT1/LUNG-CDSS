from django.urls import path

from . import views

urlpatterns = [
    path("mine/", views.my_intake_form, name="intake-mine"),
    path("patient/<uuid:patient_id>/", views.patient_intake_form, name="intake-patient"),
    path("qr/issue/", views.issue_qr_token, name="intake-qr-issue"),
    path("qr/<str:token>/", views.resolve_qr_token, name="intake-qr-resolve"),
]
