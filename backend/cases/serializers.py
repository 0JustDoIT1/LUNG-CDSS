from rest_framework import serializers
from .models import Case, NucleiPatch, GenePrediction


class NucleiPatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = NucleiPatch
        fields = ["id", "original_gcs_path", "overlay_gcs_path", "nuclei_count", "attention_rank"]


class GenePredictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GenePrediction
        fields = ["gene_name", "likelihood"]


class CaseListSerializer(serializers.ModelSerializer):
    """케이스 목록용 — 요약 정보만"""
    class Meta:
        model = Case
        fields = [
            "id", "specimen_id", "status", "review_status",
            "prediction_label", "luad_probability", "lusc_probability",
            "uploaded_at", "completed_at",
        ]


class CaseDetailSerializer(serializers.ModelSerializer):
    """케이스 상세용 — 전체 정보 + 연관 데이터"""
    nuclei_patches = NucleiPatchSerializer(many=True, read_only=True)
    gene_predictions = GenePredictionSerializer(many=True, read_only=True)

    class Meta:
        model = Case
        fields = "__all__"