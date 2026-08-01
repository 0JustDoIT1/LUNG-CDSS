"""
User.USERNAME_FIELD가 UUID(id)라서 Django 기본 ModelBackend로는 이메일 로그인이
안 된다 (앱 API 인증은 어차피 커스텀 JWT라 상관없었는데, Django Admin 로그인엔
문제가 됨). 이 백엔드가 StaffAuth.email + password로 Django Admin 로그인을
가능하게 한다. 병리사/의사/간호사 중 is_staff=True인 계정만 실제로 admin 진입
가능(권한은 Django 기본 is_staff/is_superuser로 별도 통제).
"""

from django.contrib.auth.backends import BaseBackend

from .models import StaffAuth


class StaffEmailBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        email = username or kwargs.get("email")
        if not email or not password:
            return None

        staff_auth = StaffAuth.objects.select_related("user").filter(email=email).first()
        if staff_auth is None or not staff_auth.check_password(password):
            return None

        return staff_auth.user

    def get_user(self, user_id):
        from .models import User
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
