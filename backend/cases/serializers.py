from rest_framework import serializers

from .gcs_signed_url import gcs_path_to_signed_url
from .models import (
    AIAnalysisResult,
    Case,
    CaseFinding,
    CaseReviewLog,
    ConfirmedFinding,
    GenePrediction,
    NucleiPatch,
)


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


class PatientResultSerializer(serializers.ModelSerializer):
    """Confirmed AI values that are safe to expose in the patient app."""

    case_id = serializers.UUIDField(source="id", read_only=True)
    final_subtype = serializers.CharField(source="confirmed_finding.final_subtype", read_only=True)
    final_note = serializers.CharField(source="confirmed_finding.final_note", read_only=True)
    luad_probability = serializers.FloatField(
        source="confirmed_finding.based_on_result.luad_probability", read_only=True, allow_null=True,
    )
    lusc_probability = serializers.FloatField(
        source="confirmed_finding.based_on_result.lusc_probability", read_only=True, allow_null=True,
    )
    gene_predictions = GenePredictionSerializer(
        source="confirmed_finding.based_on_result.gene_predictions", many=True, read_only=True,
    )
    is_released = serializers.SerializerMethodField()
    confirmed_at = serializers.DateTimeField(source="confirmed_finding.confirmed_at", read_only=True)
    released_at = serializers.DateTimeField(source="confirmed_finding.confirmed_at", read_only=True)

    class Meta:
        model = Case
        fields = [
            "case_id", "specimen_id", "final_subtype", "final_note",
            "luad_probability", "lusc_probability", "gene_predictions",
            "is_released", "confirmed_at", "released_at",
        ]

    def get_is_released(self, obj):
        return True


class AIAnalysisResultSerializer(serializers.ModelSerializer):
    nuclei_patches = NucleiPatchSerializer(many=True, read_only=True)
    gene_predictions = GenePredictionSerializer(many=True, read_only=True)
    heatmap_url = serializers.SerializerMethodField()

    class Meta:
        model = AIAnalysisResult
        fields = [
            "id", "model_version", "heatmap_url",
            "nuclei_density_score", "nuclei_density_level",
            "nuclei_irregularity_score", "nuclei_irregularity_level",
            "prediction_label", "luad_probability", "lusc_probability",
            "treatment_note", "created_at",
            "nuclei_patches", "gene_predictions",
        ]

    def get_heatmap_url(self, obj):
        return gcs_path_to_signed_url(obj.heatmap_gcs_path)


class ConfirmedFindingSerializer(serializers.ModelSerializer):
    confirmed_by_name = serializers.CharField(source="confirmed_by.name", read_only=True)

    class Meta:
        model = ConfirmedFinding
        fields = ["final_subtype", "final_note", "confirmed_by_name", "confirmed_at"]


class CaseReviewLogSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.name", read_only=True)

    class Meta:
        model = CaseReviewLog
        fields = ["id", "action", "subtype_at_time", "note_at_time", "reviewer_name", "created_at"]


class CaseFindingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseFinding
        fields = ["id", "mode", "strokes", "created_at"]
        read_only_fields = ["id", "created_at"]


class CaseListSerializer(serializers.ModelSerializer):
    """케이스 목록용 — 최신 AI결과 요약 + 확정여부만."""

    prediction_label = serializers.SerializerMethodField()
    luad_probability = serializers.SerializerMethodField()
    lusc_probability = serializers.SerializerMethodField()
    is_confirmed = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source="patient.name", read_only=True)

    class Meta:
        model = Case
        fields = [
            "id", "specimen_id", "status", "patient_name",
            "prediction_label", "luad_probability", "lusc_probability",
            "uploaded_at", "completed_at", "is_confirmed", "is_favorite",
        ]

    def _latest_result(self, obj):
        # ai_results는 -created_at 정렬이라 first()가 최신
        return obj.ai_results.first()

    def get_prediction_label(self, obj):
        result = self._latest_result(obj)
        return result.prediction_label if result else None

    def get_luad_probability(self, obj):
        result = self._latest_result(obj)
        return result.luad_probability if result else None

    def get_lusc_probability(self, obj):
        result = self._latest_result(obj)
        return result.lusc_probability if result else None

    def get_is_confirmed(self, obj):
        return hasattr(obj, "confirmed_finding")

    def get_is_favorite(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.favorited_by.filter(user=request.user).exists()
        return False


class CaseDetailSerializer(serializers.ModelSerializer):
    latest_ai_result = serializers.SerializerMethodField()
    confirmed_finding = serializers.SerializerMethodField()
    slide_thumbnail_url = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source="patient.name", read_only=True)

    class Meta:
        model = Case
        fields = [
            "id", "specimen_id", "status", "current_step", "patient_name",
            "slide_thumbnail_url", "uploaded_at", "analyzed_at", "completed_at",
            "latest_ai_result", "confirmed_finding", "is_favorite",
        ]

    def get_latest_ai_result(self, obj):
        result = obj.ai_results.first()
        return AIAnalysisResultSerializer(result).data if result else None

    def get_confirmed_finding(self, obj):
        finding = getattr(obj, "confirmed_finding", None)
        return ConfirmedFindingSerializer(finding).data if finding else None

    def get_slide_thumbnail_url(self, obj):
        return gcs_path_to_signed_url(obj.slide_thumbnail_gcs_path)

    def get_is_favorite(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.favorited_by.filter(user=request.user).exists()
        return False


class ReviewActionSerializer(serializers.Serializer):
    """승인/반려 공통 입력. action=confirm이면 그대로, edit이면 subtype/note 필수."""

    action = serializers.ChoiceField(choices=["confirm", "edit", "reject"])
    final_subtype = serializers.ChoiceField(choices=["LUAD", "LUSC"], required=False)
    final_note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["action"] == "edit" and not attrs.get("final_subtype"):
            raise serializers.ValidationError({"final_subtype": "반려(수정) 시 최종 아형은 필수입니다."})
        if attrs["action"] == "reject" and not attrs.get("final_note", "").strip():
            raise serializers.ValidationError({"final_note": "미승인 이유를 입력해주세요."})
        return attrs
