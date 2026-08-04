from django.contrib import admin

from .models import (
    AIAnalysisResult,
    Case,
    CaseFavorite,
    CaseFinding,
    CaseReviewLog,
    ConfirmedFinding,
    GenePrediction,
    NucleiPatch,
)


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ("specimen_id", "patient", "status", "uploaded_at", "completed_at")
    list_filter = ("status",)
    search_fields = ("specimen_id", "patient__name")


@admin.register(AIAnalysisResult)
class AIAnalysisResultAdmin(admin.ModelAdmin):
    list_display = ("case", "model_version", "prediction_label", "luad_probability", "lusc_probability")
    search_fields = ("case__specimen_id",)


admin.site.register(NucleiPatch)
admin.site.register(GenePrediction)


@admin.register(ConfirmedFinding)
class ConfirmedFindingAdmin(admin.ModelAdmin):
    list_display = ("case", "final_subtype", "confirmed_by", "confirmed_at")


@admin.register(CaseReviewLog)
class CaseReviewLogAdmin(admin.ModelAdmin):
    list_display = ("case", "reviewer", "action", "created_at")
    list_filter = ("action",)


admin.site.register(CaseFinding)
admin.site.register(CaseFavorite)
