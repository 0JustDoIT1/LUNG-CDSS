from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("cases.urls")),
    path("api/auth/", include("accounts.urls")),
    path("api/symptoms/", include("symptoms.urls")),
    path("api/medications/", include("medications.urls")),
    path("api/appointments/", include("appointments.urls")),
    path("api/intake/", include("intake.urls")),
    path("api/communication/", include("communication.urls")),
]
