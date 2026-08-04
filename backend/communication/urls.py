from django.urls import path

from . import views

urlpatterns = [
    path("threads/", views.thread_list, name="thread-list"),
    path("threads/counterparts/", views.department_counterparts, name="thread-counterparts"),
    path("threads/start/", views.start_thread, name="thread-start"),
    path("threads/<uuid:thread_id>/messages/", views.message_list_create, name="thread-messages"),
    path("notifications/", views.notification_list, name="notification-list"),
    path("notifications/<uuid:notification_id>/read/", views.notification_mark_read, name="notification-read"),
]
