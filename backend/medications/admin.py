from django.contrib import admin

from .models import MedicationLog, MedicationSchedule


@admin.register(MedicationSchedule)
class MedicationScheduleAdmin(admin.ModelAdmin):
    list_display = ("patient", "drug_name", "dosage", "start_date", "end_date", "set_by")
    search_fields = ("patient__name", "drug_name")


@admin.register(MedicationLog)
class MedicationLogAdmin(admin.ModelAdmin):
    list_display = ("schedule", "scheduled_time", "taken", "taken_at")
    list_filter = ("taken",)
