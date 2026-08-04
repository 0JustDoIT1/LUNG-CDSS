from django.urls import path

from . import views

urlpatterns = [
    path("checks/", views.submit_check, name="symptom-submit"),
    path("checks/mine/", views.my_checks, name="symptom-mine"),
    path("checks/visibility/", views.update_visibility, name="symptom-visibility"),
    path("checks/nurse-visible/", views.nurse_visible_checks, name="symptom-nurse-visible"),
    path("checks/<uuid:check_id>/review/", views.mark_reviewed, name="symptom-review"),
]
