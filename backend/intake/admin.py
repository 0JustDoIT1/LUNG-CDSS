from django.contrib import admin

from .models import IntakeForm, IntakeTemplate


@admin.register(IntakeTemplate)
class IntakeTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'version', 'is_active', 'updated_at')
    list_filter = ('is_active',)


@admin.register(IntakeForm)
class IntakeFormAdmin(admin.ModelAdmin):
    list_display = ("patient", "submitted_at", "updated_at")
    search_fields = ("patient__name",)
