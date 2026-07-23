from rest_framework import serializers
from .models import Case, NucleiPatch, GenePrediction

from .services.gcs import gcs_path_to_signed_url


class NucleiPatchSerializer(serializers.ModelSerializer):
    original_url = serializers.SerializerMethodField()
    overlay_url = serializers.SerializerMethodField()

    class Meta:
        model = NucleiPatch
        fields = ["id", "original_url", "overlay_url", "nuclei_count", "attention_rank"]

    def get_original_url(self, obj):
        return gcs_path_to_signed_url(obj.original_gcs_path)

    def get_overlay_url(self, obj):
        return gcs_path_to_signed_url(obj.overlay_gcs_path)


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
    nuclei_patches = NucleiPatchSerializer(many=True, read_only=True)
    gene_predictions = GenePredictionSerializer(many=True, read_only=True)
    heatmap_url = serializers.SerializerMethodField()
    slide_thumbnail_url = serializers.SerializerMethodField()

    class Meta:
        model = Case
        fields = "__all__"

    def get_heatmap_url(self, obj):
        return gcs_path_to_signed_url(obj.heatmap_gcs_path)

    def get_slide_thumbnail_url(self, obj):
        return gcs_path_to_signed_url(obj.slide_thumbnail_gcs_path)