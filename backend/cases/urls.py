from django.urls import path

from . import views

urlpatterns = [
    path("cases/", views.case_list_create, name="case-list-create"),
    path("cases/my-results/", views.patient_result_list, name="patient-result-list"),
    path("cases/upload-url/", views.get_upload_url, name="get-upload-url"),
    path("cases/<uuid:case_id>/", views.case_detail, name="case-detail"),
    path("cases/<uuid:case_id>/predict/", views.predict_case, name="predict-case"),
    path("cases/<uuid:case_id>/retry/", views.retry_case_analysis, name="retry-case-analysis"),
    path("cases/<uuid:case_id>/step/", views.update_case_step, name="update-case-step"),
    path("cases/<uuid:case_id>/review/", views.review_case, name="review-case"),
    path("cases/<uuid:case_id>/release/", views.release_case, name="release-case"),
    path("cases/<uuid:case_id>/review-log/", views.case_review_log_list, name="case-review-log"),
    path("cases/<uuid:case_id>/favorite/", views.toggle_favorite, name="toggle-favorite"),
    path("cases/<uuid:case_id>/findings/", views.case_finding_list_create, name="case-findings"),
    path("cases/<uuid:case_id>/findings/<uuid:finding_id>/", views.case_finding_delete, name="case-finding-delete"),
]
