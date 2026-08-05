from django.urls import path

from . import views

urlpatterns = [
    path("checks/", views.submit_check, name="symptom-submit"),
    path("checks/mine/", views.my_checks, name="symptom-mine"),
]
