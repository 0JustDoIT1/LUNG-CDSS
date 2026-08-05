from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    # 의료진 (의사/간호사/병리사)
    path("staff/signup/", views.staff_signup, name="staff-signup"),
    path("staff/login/", views.staff_login, name="staff-login"),

    # 환자
    path("patient/social-login/", views.social_login, name="patient-social-login"),
    path("patient/register/", views.patient_register, name="patient-register"),
    path("patient/profile/", views.patient_profile, name="patient-profile"),
    path("doctor/profile/", views.doctor_profile, name="doctor-profile"),
    path("staff/patients/", views.staff_patient_list, name="staff-patient-list"),
    path("hospital/", views.hospital_info, name="hospital-info"),
    path("notifications/preferences/", views.notification_preference_list, name="notification-pref-list"),
    path("notifications/preferences/update/", views.notification_preference_update, name="notification-pref-update"),
    path("device-token/", views.register_device_token, name="device-token-register"),

    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", views.logout, name="logout"),

    # 보호자
    path("guardian/invite/", views.guardian_invite, name="guardian-invite"),
    path("guardian/links/", views.guardian_link_list, name="guardian-link-list"),
    path("guardian/links/<uuid:link_id>/", views.guardian_unlink, name="guardian-unlink"),
    path("guardian/register/", views.guardian_register, name="guardian-register"),
    path("guardian/patients/", views.guardian_my_patients, name="guardian-my-patients"),
    path("guardian/patients/<uuid:patient_id>/summary/", views.guardian_patient_summary, name="guardian-patient-summary"),
]