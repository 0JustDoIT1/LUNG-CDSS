from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.utils import timezone
from django.db import IntegrityError
import os

from accounts.permissions import IsDoctor, IsPathologist
from .models import Case, NucleiPatch, GenePrediction
from .serializers import CaseListSerializer, CaseDetailSerializer
from .services import call_mosec_predict, call_mosec_thumbnail
from .gcs_signed_url import delete_case_reports, delete_slide_file, generate_upload_url

from rag.rag_service import generate_treatment_note
from rag.exceptions import RAGServiceError

INTERNAL_CALLBACK_TOKEN = os.environ.get("INTERNAL_CALLBACK_TOKEN")


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def case_list_create(request):
    if request.method == "GET":
        # 조회는 의사/병리사 둘 다 가능
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
        # 생성은 병리사만
        if not IsPathologist().has_permission(request, None):
            return Response({"error": "권한이 없습니다"}, status=status.HTTP_403_FORBIDDEN)

        specimen_id = request.data.get("specimen_id")
        slide_gcs_path = request.data.get("slide_gcs_path")

        if not specimen_id:
            return Response({"error": "specimen_id는 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

        # 사전 체크: 일반적인 경우 빠르게 친절한 에러 반환
        if Case.objects.filter(specimen_id=specimen_id).exists():
            return Response(
                {"error": f"이미 등록된 검체 ID입니다: {specimen_id}"},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            case = Case.objects.create(
                user=request.user,
                specimen_id=specimen_id,
                slide_gcs_path=slide_gcs_path,
                status="uploaded",
            )
        except IntegrityError:
            # 동시 요청으로 사전 체크를 통과했지만 DB unique 제약에 걸린 경우
            return Response(
                {"error": f"이미 등록된 검체 ID입니다: {specimen_id}"},
                status=status.HTTP_409_CONFLICT,
            )

        # 썸네일 동기 생성 — 실패해도 case 생성 자체는 성공 처리 (재시도로 복구 가능)
        try:
            thumb_result = call_mosec_thumbnail(str(case.id), slide_gcs_path)
            case.slide_thumbnail_gcs_path = thumb_result["slide_thumbnail_gcs_path"]
            case.save(update_fields=["slide_thumbnail_gcs_path"])
        except Exception as e:
            print(f"썸네일 생성 실패 (case_id={case.id}): {e}")

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
        delete_case_reports(str(case.id))
        delete_slide_file(case.slide_gcs_path)
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
    case.save(update_fields=["status", "analyzed_at"])

    try:
        result = call_mosec_predict(str(case.id), case.slide_gcs_path)
    except Exception as e:
        case.status = "failed"
        case.save(update_fields=["status"])
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    case.prediction_label = result["prediction_label"]
    case.luad_probability = result["luad_probability"]
    case.lusc_probability = result["lusc_probability"]
    case.heatmap_gcs_path = result["heatmap_gcs_path"]

    # 업로드 시점에 썸네일 생성이 실패했던 케이스에 대한 안전장치 — 없을 때만 재생성
    if not case.slide_thumbnail_gcs_path:
        try:
            thumb_result = call_mosec_thumbnail(str(case.id), case.slide_gcs_path)
            case.slide_thumbnail_gcs_path = thumb_result["slide_thumbnail_gcs_path"]
        except Exception as e:
            print(f"썸네일 폴백 생성 실패 (case_id={case.id}): {e}")

    case.nuclei_density_score = result.get("nuclei_density_score")
    case.nuclei_density_level = result.get("nuclei_density_level")
    case.nuclei_irregularity_score = result.get("nuclei_irregularity_score")
    case.nuclei_irregularity_level = result.get("nuclei_irregularity_level")

    case.status = "completed"
    case.completed_at = timezone.now()
    case.save(update_fields=[
        "prediction_label", "luad_probability", "lusc_probability",
        "heatmap_gcs_path", "slide_thumbnail_gcs_path",
        "nuclei_density_score", "nuclei_density_level",
        "nuclei_irregularity_score", "nuclei_irregularity_level",
        "status", "completed_at",
    ])

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

    gene_predictions_dict = {
        gene["gene_name"]: gene["likelihood"]
        for gene in result.get("gene_predictions", [])
    }

    try:
        rag_result = generate_treatment_note(predictions=gene_predictions_dict)
        case.treatment_note = rag_result["treatment_note"]
    except RAGServiceError as e:
        case.treatment_note = None
        print(f"RAG 소견 생성 실패 (case_id={case.id}): {e}")

    case.save(update_fields=["treatment_note"])

    return Response({"status": "completed", "case_id": str(case.id)})


@api_view(["POST"])
@permission_classes([IsPathologist])
def retry_case(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response({"error": "케이스를 찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    delete_case_reports(str(case.id))  # original.png(썸네일)는 제외하고 삭제됨

    case.status = "uploaded"
    case.current_step = None
    case.prediction_label = None
    case.luad_probability = None
    case.lusc_probability = None
    case.heatmap_gcs_path = None
    # slide_thumbnail_gcs_path는 초기화하지 않음 — 원본 슬라이드가 그대로면 썸네일도 재사용
    case.nuclei_density_score = None
    case.nuclei_density_level = None
    case.nuclei_irregularity_score = None
    case.nuclei_irregularity_level = None
    case.analyzed_at = None
    case.completed_at = None
    case.review_status = "pending"
    case.reviewed_by = None
    case.reviewer_note = None
    case.reviewed_at = None
    case.save()

    NucleiPatch.objects.filter(case=case).delete()
    GenePrediction.objects.filter(case=case).delete()

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

    action = request.data.get("action")
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


@api_view(["POST"])
@permission_classes([IsPathologist])
def get_upload_url(request):
    filename = request.data.get("filename")
    if not filename:
        return Response({"error": "filename은 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

    result = generate_upload_url(filename)
    return Response(result)