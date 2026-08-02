import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):
    """
    Custom manager. There's no shared "username" concept across roles
    (patients log in via social provider, staff via email), so user
    creation always goes through role-specific helpers instead of a
    generic create_user(username, password).
    """

    use_in_migrations = True

    def _create(self, role, name, password=None):
        if not role:
            raise ValueError("role is required")
        user = self.model(role=role, name=name)
        # Patients have no password (social login only); staff get one
        # via StaffAuth.set_password separately. This just keeps the
        # underlying password field in a well-defined "unusable" state.
        user.password = make_password(password)
        user.save(using=self._db)
        return user

    def create_patient(self, name):
        return self._create(User.Role.PATIENT, name)

    def create_staff(self, role, name, password=None):
        assert role in (User.Role.DOCTOR, User.Role.NURSE, User.Role.PATHOLOGIST)
        return self._create(role, name, password)

    def create_superuser(self, name="admin", password=None):
        user = self._create(User.Role.DOCTOR, name, password)
        user.is_staff = True
        user.is_superuser = True
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    """
    Root identity table shared by every role. Role-specific auth
    (PatientAuth / StaffAuth) and role-specific profile data
    (PatientProfile / DoctorProfile / NurseProfile / PathologistProfile)
    live in separate 1:1 tables — see the ERD in the project docs.

    PermissionsMixin은 실제 app-level 권한체계(그건 accounts/permissions.py의
    역할기반 체크로 따로 함)를 쓰려는 게 아니라, Django Admin(/admin/)이
    is_superuser/has_perm을 요구해서 최소한으로 붙여둔 것.
    """

    class Role(models.TextChoices):
        PATIENT = "patient", "환자"
        DOCTOR = "doctor", "의사"
        NURSE = "nurse", "간호사"
        PATHOLOGIST = "pathologist", "병리사"  # React 웹 전용, Flutter 앱 대상 아님
        GUARDIAN = "guardian", "보호자"  # 환자 진료정보 열람전용, 별도 프로필 없음

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=Role.choices)
    name = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin 접근용, 도메인 role과 무관
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    groups = models.ManyToManyField(
        "auth.Group", related_name="lung_cdss_users", blank=True
    )
    user_permissions = models.ManyToManyField(
        "auth.Permission", related_name="lung_cdss_users", blank=True
    )

    # No unique login handle lives on User itself (email is on StaffAuth,
    # phone/social id is on PatientAuth). USERNAME_FIELD must point at
    # something unique on this model for AbstractBaseUser's contract, so
    # we use the PK; actual login always goes through the role-specific
    # auth flow in accounts/views.py (JWT) or accounts/backends.py
    # (Django Admin), not Django's default authenticate().
    USERNAME_FIELD = "id"
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.name} ({self.role})"


class Hospital(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    map_image_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name


class PatientAuth(models.Model):
    class SocialProvider(models.TextChoices):
        GOOGLE = "google", "Google"
        KAKAO = "kakao", "Kakao"
        NAVER = "naver", "Naver"

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="patient_auth")
    social_provider = models.CharField(max_length=10, choices=SocialProvider.choices)
    social_uid = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20, unique=True)
    phone_verified_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["social_provider", "social_uid"], name="uniq_social_identity"
            )
        ]

    def __str__(self):
        return f"{self.user.name} · {self.social_provider}"


class StaffAuth(models.Model):
    """Doctor / nurse / pathologist all authenticate this way (email+password)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="staff_auth")
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        from django.contrib.auth.hashers import check_password
        return check_password(raw_password, self.password_hash)

    def __str__(self):
        return self.email


class PatientProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = "male", "남성"
        FEMALE = "female", "여성"

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="patient_profile")
    patient_number = models.CharField(max_length=20, unique=True, editable=False)
    birth_date = models.DateField()
    gender = models.CharField(max_length=10, choices=Gender.choices, null=True, blank=True)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT)
    assigned_doctor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="assigned_patients",
        limit_choices_to={"role": User.Role.DOCTOR},
    )

    def save(self, *args, **kwargs):
        if not self.patient_number:
            self.patient_number = self._generate_patient_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_patient_number(length=8):
        import random
        import string
        alphabet = string.ascii_uppercase + string.digits
        while True:
            candidate = "".join(random.choices(alphabet, k=length))
            if not PatientProfile.objects.filter(patient_number=candidate).exists():
                return candidate

    def __str__(self):
        return f"{self.user.name} ({self.patient_number})"


class DoctorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="doctor_profile")
    license_number = models.CharField(max_length=30, unique=True)
    license_verified = models.BooleanField(default=False)
    license_verified_at = models.DateTimeField(blank=True, null=True)
    department = models.CharField(max_length=50)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT)
    photo_url = models.URLField(blank=True, null=True)
    specialty_tags = models.JSONField(default=list, blank=True)  # e.g. ["폐암클리닉", "금연클리닉"]

    def __str__(self):
        return f"Dr. {self.user.name} ({self.department})"


class NurseProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="nurse_profile")
    department = models.CharField(max_length=50)
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT)

    def __str__(self):
        return f"{self.user.name} RN ({self.department})"


class PathologistProfile(models.Model):
    """React 웹에서 슬라이드 업로드를 담당하는 역할. Flutter 앱 대상 아님."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True, related_name="pathologist_profile")
    department = models.CharField(max_length=50, default="병리과")
    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT)

    def __str__(self):
        return f"{self.user.name} (병리사)"


class DoctorOffDay(models.Model):
    """단발성 휴진일."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="off_days",
                                limit_choices_to={"role": User.Role.DOCTOR})
    date = models.DateField()
    reason = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.doctor.name} off on {self.date}"


class DoctorWeeklySchedule(models.Model):
    """요일별 정기 오전/오후 진료·휴진 여부."""

    class DayOfWeek(models.TextChoices):
        MON = "mon", "월"
        TUE = "tue", "화"
        WED = "wed", "수"
        THU = "thu", "목"
        FRI = "fri", "금"
        SAT = "sat", "토"

    class Period(models.TextChoices):
        AM = "am", "오전"
        PM = "pm", "오후"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="weekly_schedule",
                                limit_choices_to={"role": User.Role.DOCTOR})
    day_of_week = models.CharField(max_length=3, choices=DayOfWeek.choices)
    period = models.CharField(max_length=2, choices=Period.choices)
    available = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "day_of_week", "period"], name="uniq_doctor_weekly_slot"
            )
        ]

    def __str__(self):
        return f"{self.doctor.name} {self.day_of_week}/{self.period}: {'O' if self.available else 'X'}"


class DeviceToken(models.Model):
    class AppType(models.TextChoices):
        PATIENT_APP = "patient_app", "환자 앱"
        MEDICAL_APP = "medical_app", "의료진 앱"

    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="device_tokens")
    fcm_token = models.CharField(max_length=255)
    app_type = models.CharField(max_length=20, choices=AppType.choices)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.name} · {self.app_type}/{self.platform}"


class NotificationPreference(models.Model):
    class Category(models.TextChoices):
        MEDICATION = "medication", "복약"
        APPOINTMENT = "appointment", "예약"
        CHAT = "chat", "채팅"
        TRIAGE = "triage", "증상위험도"
        CASE_REVIEW = "case_review", "케이스검토"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notification_preferences")
    category = models.CharField(max_length=20, choices=Category.choices)
    enabled = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "category"], name="uniq_user_category_pref")
        ]

    def __str__(self):
        return f"{self.user.name} · {self.category}: {'on' if self.enabled else 'off'}"


class GuardianLink(models.Model):
    """
    보호자는 환자 계정과 별개의 role(guardian)로 존재 — PatientProfile을
    만들지 않는다. 초대코드로 최초 1회만 등록하고, 이후엔 발급된 JWT로
    재로그인(A안 확정: 별도 PIN 없이 토큰 저장 방식).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="guardian_links",
                                 limit_choices_to={"role": "patient"})
    guardian = models.ForeignKey(User, on_delete=models.CASCADE, related_name="patient_links",
                                  null=True, blank=True, limit_choices_to={"role": "guardian"})
    invite_code = models.CharField(max_length=12, unique=True)
    invited_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-invited_at"]

    def __str__(self):
        status = "등록완료" if self.accepted_at else "대기중"
        return f"{self.patient.name} 보호자링크 ({status})"
