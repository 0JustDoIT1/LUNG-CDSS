from django.urls import path
from . import views

urlpatterns = [
    path("cases/", views.case_list_create, name="case-list-create"),
    path("cases/<uuid:case_id>/", views.case_detail, name="case-detail"),
    path("cases/<uuid:case_id>/predict/", views.predict_case, name="predict-case"),
    path("cases/<uuid:case_id>/retry/", views.retry_case, name="retry-case"),
]