from rest_framework import serializers
from django.contrib.auth.models import User
from .models import HospitalProfile

import re


class SignupSerializer(serializers.Serializer):
    hospital_code = serializers.RegexField(
        regex=r'^\d{6}$',
        error_messages={"invalid": "병원코드는 숫자 6자리여야 합니다."}
    )
    name = serializers.CharField(allow_blank=False, trim_whitespace=True)
    department = serializers.ChoiceField(choices=["pathology", "pulmonology", "oncology"])
    role = serializers.ChoiceField(choices=["doctor", "pathologist"])
    password = serializers.CharField(write_only=True)

    def validate_hospital_code(self, value):
        if HospitalProfile.objects.filter(hospital_code=value).exists():
            raise serializers.ValidationError("이미 등록된 병원코드입니다.")
        return value

    def validate_password(self, value):
        pattern = r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]).{8,16}$'
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                "비밀번호는 8~16자, 영문자·숫자·특수문자를 모두 포함해야 합니다."
            )
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["hospital_code"],
            password=validated_data["password"],
        )
        HospitalProfile.objects.create(
            user=user,
            hospital_code=validated_data["hospital_code"],
            name=validated_data["name"],
            department=validated_data["department"],
            role=validated_data["role"],
        )
        return user