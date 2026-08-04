from django.contrib import admin

from .models import Appointment


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("patient", "doctor", "department", "confirmed_slot", "status")
    list_filter = ("status", "department")
    search_fields = ("patient__name", "doctor__name")
