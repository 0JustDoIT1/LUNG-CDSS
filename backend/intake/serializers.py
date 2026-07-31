from rest_framework import serializers

from .models import IntakeForm


class IntakeFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntakeForm
        fields = ["id", "content", "submitted_at", "updated_at"]
        read_only_fields = ["id", "submitted_at", "updated_at"]
