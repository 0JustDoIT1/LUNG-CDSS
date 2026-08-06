from rest_framework import serializers

from .models import Appointment


class DepartmentOptionSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()


class WeeklyScheduleSerializer(serializers.Serializer):
    day_of_week = serializers.ChoiceField(choices=["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
    period = serializers.ChoiceField(choices=["am", "pm"])
    available = serializers.BooleanField()


class DoctorOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    department = serializers.CharField()
    photo_url = serializers.URLField(allow_null=True, required=False)
    specialty_tags = serializers.ListField(child=serializers.CharField())
    is_assigned = serializers.BooleanField()
    weekly_schedule = WeeklyScheduleSerializer(many=True)


class AppointmentSlotSerializer(serializers.Serializer):
    time = serializers.CharField()
    datetime = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=["available", "closed"])


class AppointmentSlotListSerializer(serializers.Serializer):
    date = serializers.DateField()
    timezone = serializers.CharField()
    slots = AppointmentSlotSerializer(many=True)


class AppointmentCreateSerializer(serializers.Serializer):
    doctor_id = serializers.UUIDField()
    department = serializers.CharField()
    requested_at_slot = serializers.DateTimeField()


class AppointmentSerializer(serializers.ModelSerializer):
    patient_id = serializers.UUIDField(source="patient.id", read_only=True)
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.name", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id", "patient_id", "patient_name", "doctor_name", "department",
            "requested_at_slot", "confirmed_slot", "status", "created_at",
            "rejection_reason", "proposed_slot", "proposal_reason", "reviewed_at",
        ]
        read_only_fields = fields
