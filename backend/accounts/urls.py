from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    # 의료진 (의사/간호사/병리사)
    path("staff/signup/", views.staff_signup, name="staff-signup"),
    path("staff/login/", views.staff_login, name="staff-login"),

    # 환자
    path("patient/social-login/", views.social_login, name="patient-social-login"),
    path("patient/phone/request/", views.phone_verify_request, name="patient-phone-request"),
    path("patient/phone/confirm/", views.phone_verify_confirm, name="patient-phone-confirm"),

    path("refresh/", TokenRefreshView.as_view(), name="token-refresh"),
]
