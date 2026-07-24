from rest_framework.permissions import BasePermission


class IsDoctor(BasePermission):
    def has_permission(self, request, view):
        profile = getattr(request.user, "hospital_profile", None)
        return bool(request.user.is_authenticated and profile and profile.role == "doctor")


class IsPathologist(BasePermission):
    def has_permission(self, request, view):
        profile = getattr(request.user, "hospital_profile", None)
        return bool(request.user.is_authenticated and profile and profile.role == "pathologist")