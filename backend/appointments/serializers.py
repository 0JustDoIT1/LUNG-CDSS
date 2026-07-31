from rest_framework import serializers

from .models import Appointment


class AppointmentCreateSerializer(serializers.Serializer):
    doctor_id = serializers.UUIDField()
    department = serializers.CharField()
    requested_at_slot = serializers.DateTimeField()


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.name", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id", "patient_name", "doctor_name", "department",
            "requested_at_slot", "confirmed_slot", "status", "created_at",
        ]
        read_only_fields = fields
