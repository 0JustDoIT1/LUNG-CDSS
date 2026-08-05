from rest_framework import serializers

from .models import MedicationLog, MedicationSchedule


class MedicationScheduleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicationSchedule
        fields = ["id", "patient", "drug_name", "dosage", "times_per_day", "start_date", "end_date"]
        read_only_fields = ["id"]


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
