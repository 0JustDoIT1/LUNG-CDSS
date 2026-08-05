from django.contrib import admin

from .models import SymptomCheck


@admin.register(SymptomCheck)
class SymptomCheckAdmin(admin.ModelAdmin):
    list_display = ("patient", "checked_at", "risk_level")
    list_filter = ("risk_level",)
    search_fields = ("patient__name",)
