from django.contrib import admin

from .models import SymptomCheck


@admin.register(SymptomCheck)
class SymptomCheckAdmin(admin.ModelAdmin):
    list_display = ("patient", "checked_at", "risk_level", "visible_to_nurse", "nurse_reviewed")
    list_filter = ("risk_level", "nurse_reviewed")
    search_fields = ("patient__name",)
