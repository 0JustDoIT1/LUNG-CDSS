import re

from django.db import transaction
from rest_framework import serializers

from .models import (
    DoctorProfile,
    GuardianLink,
    Hospital,
    NurseProfile,
    PathologistProfile,
    PatientAuth,
    PatientProfile,
    StaffAuth,
    User,
)
from .services import LicenseVerificationError, verify_doctor_license

PASSWORD_PATTERN = r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]).{8,16}$'


# ── 의사/간호사/병리사 (StaffAuth, 이메일+비밀번호) ──────────────────────

class StaffSignupSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["doctor", "nurse", "pathologist"])
    name = serializers.CharField(trim_whitespace=True)
    email = serializers.EmailField()
    phone_number = serializers.CharField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)
    hospital_id = serializers.UUIDField()
    department = serializers.CharField()

    # 의사만 필수
    license_number = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        if StaffAuth.objects.filter(email=value).exists():
            raise serializers.ValidationError("이미 등록된 이메일입니다.")
        return value

    def validate_password(self, value):
        if not re.match(PASSWORD_PATTERN, value):
            raise serializers.ValidationError(
                "비밀번호는 8~16자, 영문자·숫자·특수문자를 모두 포함해야 합니다."
            )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "비밀번호가 일치하지 않습니다."})

        if attrs["role"] == "doctor":
            license_number = attrs.get("license_number")
            if not license_number:
                raise serializers.ValidationError({"license_number": "의사는 면허번호가 필수입니다."})
            if DoctorProfile.objects.filter(license_number=license_number).exists():
                raise serializers.ValidationError({"license_number": "이미 등록된 면허번호입니다."})
            try:
                valid_format = verify_doctor_license(license_number)
            except LicenseVerificationError as e:
                raise serializers.ValidationError({"license_number": str(e)})
            if not valid_format:
                raise serializers.ValidationError(
                    {"license_number": "입력하신 면허번호를 확인할 수 없습니다, 다시 확인해주세요."}
                )
            # 실제 발급기관 검증API는 아직 미연동 — 형식만 맞으면 가입은 허용한다.
            # DoctorProfile엔 "검증여부" 필드 자체가 없음(오해방지 위해 제거함,
            # accounts/models.py 참고) — 나중에 실제 API 붙일 때 필드도 같이 추가.

        try:
            attrs["_hospital"] = Hospital.objects.get(id=attrs["hospital_id"])
        except Hospital.DoesNotExist:
            raise serializers.ValidationError({"hospital_id": "존재하지 않는 병원입니다."})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data["role"]
        hospital = validated_data["_hospital"]

        user = User.objects.create_staff(role=role, name=validated_data["name"])
        staff_auth = StaffAuth(user=user, email=validated_data["email"],
                                phone_number=validated_data["phone_number"])
        staff_auth.set_password(validated_data["password"])
        staff_auth.save()

        if role == "doctor":
            DoctorProfile.objects.create(
                user=user,
                license_number=validated_data["license_number"],
                department=validated_data["department"],
                hospital=hospital,
            )
        elif role == "nurse":
            NurseProfile.objects.create(user=user, department=validated_data["department"], hospital=hospital)
        else:  # pathologist — React 웹 전용
            PathologistProfile.objects.create(
                user=user, department=validated_data["department"] or "병리과", hospital=hospital
            )

        return user


class StaffLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


# ── 환자 (PatientAuth, 소셜로그인 + SMS) ─────────────────────────────

class SocialLoginSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=["google", "kakao", "naver"])
    token = serializers.CharField()


class PatientRegisterSerializer(serializers.Serializer):
    """
    SMS 인증코드 확인 단계만 없앴다 — 번호 입력 자체는 여전히 필수.
    소셜로그인 직후 이 정보만으로 바로 가입을 완료한다.
    """
    signup_token = serializers.CharField()
    birth_date = serializers.DateField()
    hospital_id = serializers.UUIDField()
    phone_number = serializers.RegexField(regex=r'^01[0-9]-?\d{3,4}-?\d{4}$')


class PatientProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name")
    hospital_name = serializers.CharField(source="hospital.name", read_only=True)

    class Meta:
        model = PatientProfile
        fields = ["patient_number", "birth_date", "gender", "hospital_name", "assigned_doctor", "name"]
        read_only_fields = ["patient_number", "hospital_name", "assigned_doctor"]
        # 소셜로그인에서 받아온 이름이 실명이 아니라 닉네임일 수 있어 수정 허용.
        # birth_date, gender, name만 수정 가능 — 환자번호/소속병원/담당의는 불가.

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        if user_data and "name" in user_data:
            instance.user.name = user_data["name"]
            instance.user.save(update_fields=["name"])
        return super().update(instance, validated_data)


# ── 보호자 ────────────────────────────────────────────────────────

class GuardianRegisterSerializer(serializers.Serializer):
    invite_code = serializers.CharField(max_length=12)
    name = serializers.CharField(trim_whitespace=True)


class GuardianLinkSerializer(serializers.ModelSerializer):
    guardian_name = serializers.CharField(source="guardian.name", read_only=True, allow_null=True)

    class Meta:
        model = GuardianLink
        fields = ["id", "invite_code", "guardian_name", "invited_at", "accepted_at"]


class DoctorProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorProfile
        fields = ["photo_url", "specialty_tags"]


class HospitalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hospital
        fields = ["id", "name", "address", "phone", "map_image_url"]


class NotificationPreferenceSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=["medication", "appointment", "chat", "triage", "case_review"])
    enabled = serializers.BooleanField()


class DeviceTokenSerializer(serializers.Serializer):
    fcm_token = serializers.CharField()
    app_type = serializers.ChoiceField(choices=["patient_app", "medical_app"])
    platform = serializers.ChoiceField(choices=["ios", "android"])
