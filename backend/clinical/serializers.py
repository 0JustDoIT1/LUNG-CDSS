from rest_framework import serializers

from .models import AuditLog, ClinicalNote, Prescription, TnmCandidateAssessment


class TnmAssessmentRequestSerializer(serializers.Serializer):
    case_id = serializers.UUIDField(required=False)
    t_candidate = serializers.CharField(max_length=8)
    n_candidate = serializers.CharField(max_length=8)
    imaging_evidence = serializers.JSONField()

    def validate_imaging_evidence(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("imaging_evidence must be an object.")
        lesions = value.get("extrathoracic_lesions", [])
        if not isinstance(lesions, list):
            raise serializers.ValidationError("extrathoracic_lesions must be a list.")
        return value


class TnmCandidateAssessmentSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source="doctor.name", read_only=True)

    class Meta:
        model = TnmCandidateAssessment
        fields = ["id", "case", "doctor_name", "t_candidate", "n_candidate", "m_candidate", "stage_group_candidate", "imaging_evidence", "result", "created_at"]


class ClinicalNoteSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source="doctor.name", read_only=True)

    class Meta:
        model = ClinicalNote
        fields = ["id", "patient", "appointment", "content", "doctor_name", "created_at", "updated_at"]
        read_only_fields = ["id", "patient", "doctor_name", "created_at", "updated_at"]


class PrescriptionSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source="doctor.name", read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id", "patient", "medication_name", "dosage", "instructions",
            "start_date", "end_date", "status", "doctor_name", "created_at",
        ]
        read_only_fields = ["id", "patient", "doctor_name", "created_at"]

    def validate(self, attrs):
        if attrs.get("end_date") and attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": "종료일은 시작일보다 빠를 수 없습니다."})
        return attrs


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.name", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "actor_name", "action", "resource_type", "resource_id", "metadata", "created_at"]
