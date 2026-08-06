from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),

    # API 문서 — 팀원(Flutter)이 브라우저에서 바로 엔드포인트 확인/테스트 가능
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    path("api/", include("cases.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/symptoms/", include("symptoms.urls")),
    path("api/medications/", include("medications.urls")),
    path("api/appointments/", include("appointments.urls")),
    path("api/intake/", include("intake.urls")),
    path("api/communication/", include("communication.urls")),
    path("api/clinical/", include("clinical.urls")),
]
