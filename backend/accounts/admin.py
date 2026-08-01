from django.contrib import admin

from .models import (
    DeviceToken,
    DoctorOffDay,
    DoctorProfile,
    DoctorWeeklySchedule,
    Hospital,
    NotificationPreference,
    NurseProfile,
    PathologistProfile,
    PatientAuth,
    PatientProfile,
    StaffAuth,
    User,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "role", "is_active", "is_staff", "created_at")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at")


@admin.register(Hospital)
class HospitalAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "address", "phone")
    search_fields = ("name",)
    readonly_fields = ("id",)


@admin.register(StaffAuth)
class StaffAuthAdmin(admin.ModelAdmin):
    list_display = ("email", "user", "phone_number", "created_at")
    search_fields = ("email", "user__name")


@admin.register(PatientAuth)
class PatientAuthAdmin(admin.ModelAdmin):
    list_display = ("user", "social_provider", "phone_number", "phone_verified_at")
    search_fields = ("phone_number", "user__name")


@admin.register(PatientProfile)
class PatientProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "patient_number", "birth_date", "hospital", "assigned_doctor")
    search_fields = ("patient_number", "user__name")
    readonly_fields = ("patient_number",)


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "license_number", "license_verified", "department", "hospital")
    list_filter = ("department", "license_verified")
    search_fields = ("license_number", "user__name")


@admin.register(NurseProfile)
class NurseProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "department", "hospital")
    list_filter = ("department",)


@admin.register(PathologistProfile)
class PathologistProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "department", "hospital")


@admin.register(DoctorOffDay)
class DoctorOffDayAdmin(admin.ModelAdmin):
    list_display = ("doctor", "date", "reason")
    list_filter = ("date",)


@admin.register(DoctorWeeklySchedule)
class DoctorWeeklyScheduleAdmin(admin.ModelAdmin):
    list_display = ("doctor", "day_of_week", "period", "available")
    list_filter = ("day_of_week", "period", "available")


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "app_type", "platform", "updated_at")
    list_filter = ("app_type", "platform")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "category", "enabled")
    list_filter = ("category", "enabled")
