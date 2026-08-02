from rest_framework.permissions import BasePermission


def _has_role(request, role):
    return bool(request.user and request.user.is_authenticated and request.user.role == role)


class IsPatient(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "patient")


class IsDoctor(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "doctor")


class IsNurse(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "nurse")


class IsPathologist(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "pathologist")


class IsGuardian(BasePermission):
    def has_permission(self, request, view):
        return _has_role(request, "guardian")


class IsDoctorOrNurse(BasePermission):
    """의료진 앱(의사/간호사) 공통 접근 — 병리사는 React 웹 전용이라 여기 포함 안 됨."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("doctor", "nurse")
        )
