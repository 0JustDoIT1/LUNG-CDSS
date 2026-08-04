from django.contrib import admin

from .models import IntakeForm


@admin.register(IntakeForm)
class IntakeFormAdmin(admin.ModelAdmin):
    list_display = ("patient", "submitted_at", "updated_at")
    search_fields = ("patient__name",)
