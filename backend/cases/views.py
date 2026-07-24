from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.utils import timezone
import os

from accounts.permissions import IsDoctor, IsPathologist
from .models import Case, NucleiPatch, GenePrediction
from .serializers import CaseListSerializer, CaseDetailSerializer
from .services import call_mosec_predict

INTERNAL_CALLBACK_TOKEN = os.environ.get("INTERNAL_CALLBACK_TOKEN")


@api_view(["GET", "POST"])
@permission_classes([IsPathologist])
def case_list_create(request):
    if request.method == "GET":
        queryset = Case.objects.all()

        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        label_param = request.query_params.get("label")
        if label_param:
            queryset = queryset.filter(prediction_label=label_param)

        search = request.query_params.get("search")
        if search:
            queryset = queryset.filter(specimen_id__icontains=search)

        serializer = CaseListSerializer(queryset, many=True)
        return Response(serializer.data)

    elif request.method == "POST":
        specimen_id = request.data.get("specimen_id")
        slide_gcs_path = request.data.get("slide_gcs_path")

        if not specimen_id:
            return Response({"error": "specimen_id는 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

        case = Case.objects.create(
            user=request.user,
            specimen_id=specimen_id,
            slide_gcs_path=slide_gcs_path,
            status="uploaded",
        )
        serializer = CaseDetailSerializer(case)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def case_detail(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response({"error": "케이스를 찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        serializer = CaseDetailSerializer(case)
        return Response(serializer.data)

    elif request.method == "DELETE":
        case.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsPathologist])
def predict_case(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response({"error": "케이스를 찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    if case.status == "processing":
        return Response({"error": "이미 분석이 진행 중입니다"}, status=status.HTTP_409_CONFLICT)

    case.status = "processing"
    case.analyzed_at = timezone.now()
    case.save()

    try:
        result = call_mosec_predict(str(case.id), case.slide_gcs_path)
    except Exception as e:
        case.status = "failed"
        case.save()
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    case.prediction_label = result["prediction_label"]
    case.luad_probability = result["luad_probability"]
    case.lusc_probability = result["lusc_probability"]
    case.heatmap_gcs_path = result["heatmap_gcs_path"]
    case.slide_thumbnail_gcs_path = result.get("slide_thumbnail_gcs_path")

    case.nuclei_density_score = result.get("nuclei_density_score")
    case.nuclei_density_level = result.get("nuclei_density_level")
    case.nuclei_irregularity_score = result.get("nuclei_irregularity_score")
    case.nuclei_irregularity_level = result.get("nuclei_irregularity_level")

    case.status = "completed"
    case.completed_at = timezone.now()
    case.save()

    NucleiPatch.objects.filter(case=case).delete()
    for patch in result.get("nuclei_patches", []):
        NucleiPatch.objects.create(
            case=case,
            original_gcs_path=patch["original_gcs_path"],
            overlay_gcs_path=patch["overlay_gcs_path"],
            nuclei_count=patch["nuclei_count"],
            attention_rank=patch["attention_rank"],
        )

    GenePrediction.objects.filter(case=case).delete()
    for gene in result.get("gene_predictions", []):
        GenePrediction.objects.create(
            case=case,
            gene_name=gene["gene_name"],
            likelihood=gene["likelihood"],
        )

    return Response({"status": "completed", "case_id": str(case.id)})


@api_view(["POST"])
@permission_classes([IsPathologist])
def retry_case(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response({"error": "케이스를 찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    case.status = "uploaded"
    case.save()
    return Response({"status": "reset", "case_id": str(case.id)})


@api_view(["POST"])
@permission_classes([AllowAny])
def update_case_step(request, case_id):
    if request.headers.get("X-Internal-Token") != INTERNAL_CALLBACK_TOKEN:
        return Response({"error": "unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response({"error": "not found"}, status=status.HTTP_404_NOT_FOUND)

    step = request.data.get("step")
    case.current_step = step
    case.save(update_fields=["current_step"])
    return Response({"status": "ok"})


@api_view(["POST"])
@permission_classes([IsDoctor])
def review_case(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response({"error": "케이스를 찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    action = request.data.get("action")  # "confirm" | "reject"
    reviewer_note = request.data.get("reviewer_note", "")

    if action not in ["confirm", "reject"]:
        return Response({"error": "action은 confirm 또는 reject여야 합니다"}, status=status.HTTP_400_BAD_REQUEST)

    case.review_status = "confirmed" if action == "confirm" else "rejected"
    case.reviewed_by = request.user
    case.reviewer_note = reviewer_note
    case.reviewed_at = timezone.now()
    case.save()

    serializer = CaseDetailSerializer(case)
    return Response(serializer.data)