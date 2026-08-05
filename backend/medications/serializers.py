from rest_framework import serializers

from .models import MedicationLog, MedicationSchedule


class MedicationScheduleCreateSerializer(serializers.ModelSerializer):
    times_per_day = serializers.ListField(
        child=serializers.RegexField(
            regex=r"^(?:[01]\d|2[0-3]):[0-5]\d$",
            error_messages={"invalid": "Use HH:MM in 24-hour format (for example, 09:00)."},
        ),
        allow_empty=False,
        help_text='Daily dose times as unique 24-hour HH:MM strings, e.g. ["09:00", "18:00"].',
    )

    class Meta:
        model = MedicationSchedule
        fields = ["id", "patient", "drug_name", "dosage", "times_per_day", "start_date", "end_date"]
        read_only_fields = ["id"]

    def validate_times_per_day(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Dose times must not contain duplicates.")
        return sorted(value)

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date must not be before start date."})
        return attrs


class MedicationScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicationSchedule
        fields = ["id", "drug_name", "dosage", "times_per_day", "start_date", "end_date"]


class MedicationLogSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(source="schedule.drug_name", read_only=True)
    dosage = serializers.CharField(source="schedule.dosage", read_only=True)

    class Meta:
        model = MedicationLog
        fields = ["id", "drug_name", "dosage", "scheduled_time", "taken", "taken_at"]
        read_only_fields = ["id", "drug_name", "dosage", "scheduled_time"]


class DailyComplianceSerializer(serializers.Serializer):
    date = serializers.DateField()
    scheduled_count = serializers.IntegerField()
    taken_count = serializers.IntegerField()
    missed_count = serializers.IntegerField()
    compliance_rate = serializers.IntegerField(allow_null=True)


class MonthlyComplianceSerializer(serializers.Serializer):
    month = serializers.RegexField(regex=r"^\d{4}-\d{2}$")
    timezone = serializers.CharField()
    scheduled_count = serializers.IntegerField()
    taken_count = serializers.IntegerField()
    missed_count = serializers.IntegerField()
    compliance_rate = serializers.IntegerField(allow_null=True)
    daily = DailyComplianceSerializer(many=True)


class PendingSetupPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class MedicationReminderRequestSerializer(serializers.Serializer):
    patient_id = serializers.UUIDField()
    message = serializers.CharField(required=False, allow_blank=False)


class MedicationReminderResponseSerializer(serializers.Serializer):
    accepted = serializers.BooleanField()
    notification_id = serializers.UUIDField(allow_null=True)
