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
                verified = verify_doctor_license(license_number)
            except LicenseVerificationError as e:
                raise serializers.ValidationError({"license_number": str(e)})
            if not verified:
                raise serializers.ValidationError(
                    {"license_number": "입력하신 면허번호를 확인할 수 없습니다, 다시 확인해주세요."}
                )
            attrs["_license_verified"] = True

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
                license_verified=validated_data.get("_license_verified", False),
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


class PhoneVerifyRequestSerializer(serializers.Serializer):
    phone_number = serializers.RegexField(regex=r'^01[0-9]-?\d{3,4}-?\d{4}$')


class PhoneVerifyConfirmSerializer(serializers.Serializer):
    phone_number = serializers.CharField()
    code = serializers.RegexField(regex=r'^\d{6}$')
    # 회원가입 완료를 위한 임시 세션 식별자 (소셜검증 직후 발급, 캐시에 저장)
    signup_token = serializers.CharField()
    birth_date = serializers.DateField()
    hospital_id = serializers.UUIDField()


class PatientProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)

    class Meta:
        model = PatientProfile
        fields = ["patient_number", "birth_date", "hospital", "assigned_doctor", "name"]


# ── 보호자 ────────────────────────────────────────────────────────

class GuardianRegisterSerializer(serializers.Serializer):
    invite_code = serializers.CharField(max_length=12)
    name = serializers.CharField(trim_whitespace=True)


class GuardianLinkSerializer(serializers.ModelSerializer):
    guardian_name = serializers.CharField(source="guardian.name", read_only=True, allow_null=True)

    class Meta:
        model = GuardianLink
        fields = ["id", "invite_code", "guardian_name", "invited_at", "accepted_at"]
