import os

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.models import PatientProfile, User
from accounts.permissions import IsDoctor, IsPathologist, IsPatient
from communication.services import notify
from .gcs_signed_url import delete_case_reports, delete_slide_file, generate_upload_url
from .models import (
    Case,
    CaseFavorite,
    CaseFinding,
    CaseReviewLog,
    ConfirmedFinding,
)
from .pagination import CasePagination
from .serializers import (
    CaseDetailSerializer,
    CaseFindingSerializer,
    CaseListSerializer,
    PatientCaseResultSerializer,
    ReviewActionSerializer,
)
from .services import call_mosec_thumbnail
from .tasks import run_case_analysis
from core.responses import error_response, validation_error_response

INTERNAL_CALLBACK_TOKEN = os.environ.get("INTERNAL_CALLBACK_TOKEN")


@extend_schema(
    tags=["cases"],
    parameters=[
        OpenApiParameter("status", str, description="uploaded/processing/pending_review/confirmed/failed"),
        OpenApiParameter("search", str, description="검체 ID, 환자 이름, AI 진단명 검색"),
        OpenApiParameter("favorite", str, description="'true'면 즐겨찾기만"),
    ],
    responses={200: CaseListSerializer(many=True)},
)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def case_list_create(request):
    if request.method == "GET":
        queryset = Case.objects.select_related("patient").prefetch_related("ai_results", "confirmed_finding")

        # 환자는 본인에게 공개된 최종 결과만, 의료진은 전체(병원 단일 고정 전제) 조회
        if request.user.role == "patient":
            queryset = queryset.filter(
                patient=request.user,
                confirmed_finding__released_at__isnull=False,
            )

        status_param = request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        search = request.query_params.get("search")
        if search:
            search = search.strip()
            queryset = queryset.filter(
                Q(specimen_id__icontains=search)
                | Q(patient__name__icontains=search)
                | Q(ai_results__prediction_label__icontains=search)
                | Q(confirmed_finding__final_subtype__icontains=search)
            ).distinct()

        favorite_param = request.query_params.get("favorite")
        if favorite_param == "true":
            queryset = queryset.filter(favorited_by__user=request.user).distinct()

        summary = {
            "total": queryset.count(),
            "pending_review": queryset.filter(status="pending_review").count(),
            "confirmed": queryset.filter(status="confirmed").count(),
            "failed": queryset.filter(status="failed").count(),
        }

        paginator = CasePagination()
        page = paginator.paginate_queryset(queryset.order_by("-uploaded_at"), request)
        serializer_class = PatientCaseResultSerializer if request.user.role == "patient" else CaseListSerializer
        serializer = serializer_class(page, many=True, context={"request": request})
        return paginator.get_paginated_response(serializer.data, summary=summary)

    # POST: 케이스 생성은 병리사만 (React 웹 업로드 흐름)
    if not IsPathologist().has_permission(request, None):
        return error_response("권한이 없습니다", status_code=status.HTTP_403_FORBIDDEN)

    specimen_id = str(request.data.get("specimen_id", "")).strip()
    slide_gcs_path = str(request.data.get("slide_gcs_path", "")).strip()
    patient_id = request.data.get("patient_id")

    if not specimen_id or not slide_gcs_path or not patient_id:
        return error_response(
            "검체 ID, 슬라이드 파일, 환자는 필수입니다.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={
                "specimen_id": ["필수 항목입니다."] if not specimen_id else [],
                "slide_gcs_path": ["필수 항목입니다."] if not slide_gcs_path else [],
                "patient_id": ["필수 항목입니다."] if not patient_id else [],
            },
        )

    try:
        patient = User.objects.filter(
            id=patient_id,
            role=User.Role.PATIENT,
            is_active=True,
        ).first()
    except (ValidationError, ValueError):
        patient = None
    if patient is None:
        return error_response(
            "선택한 환자를 찾을 수 없거나 비활성 상태입니다.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"patient_id": ["유효한 환자를 선택해주세요."]},
        )

    if Case.objects.filter(specimen_id=specimen_id).exists():
        return error_response(
            f"이미 등록된 검체 ID입니다: {specimen_id}",
            status_code=status.HTTP_409_CONFLICT,
            details={"specimen_id": ["이미 사용 중인 검체 ID입니다."]},
        )

    try:
        case = Case.objects.create(
            patient=patient,
            uploaded_by=request.user,
            specimen_id=specimen_id,
            slide_gcs_path=slide_gcs_path,
            status=Case.Status.UPLOADED,
        )
    except IntegrityError:
        return error_response(f"이미 등록된 검체 ID입니다: {specimen_id}", status_code=status.HTTP_409_CONFLICT)

    try:
        thumb_result = call_mosec_thumbnail(str(case.id), case.slide_gcs_path)
        case.slide_thumbnail_gcs_path = thumb_result["slide_thumbnail_gcs_path"]
        case.save(update_fields=["slide_thumbnail_gcs_path"])
    except Exception as e:
        print(f"썸네일 생성 실패 (case_id={case.id}): {e}")

    serializer = CaseDetailSerializer(case, context={"request": request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["cases"], responses={200: CaseDetailSerializer})
@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def case_detail(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return error_response("케이스를 찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)

    if request.user.role == "patient" and case.patient_id != request.user.id:
        return error_response("권한이 없습니다", status_code=status.HTTP_403_FORBIDDEN)

    # 환자는 의사가 명시적으로 공개한 확정본만 열람 가능
    finding = getattr(case, "confirmed_finding", None)
    if request.user.role == "patient" and (finding is None or finding.released_at is None):
        return error_response("아직 확인할 수 없는 결과입니다", status_code=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        if request.user.role == "patient":
            return Response(PatientCaseResultSerializer(case).data)
        serializer = CaseDetailSerializer(case, context={"request": request})
        return Response(serializer.data)

    # DELETE — 병리사만 가능. 환자/의사/간호사는 GET 권한체크를 통과했더라도
    # 진료기록 삭제까지 넘어가면 안 됨(의료법상 보관의무와 충돌 소지).
    if request.user.role != "pathologist":
        return error_response("권한이 없습니다", status_code=status.HTTP_403_FORBIDDEN)

    delete_case_reports(str(case.id))
    delete_slide_file(case.slide_gcs_path)
    case.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _queue_analysis(case_id, *, retry):
    now = timezone.now()
    with transaction.atomic():
        try:
            case = Case.objects.select_for_update().get(id=case_id)
        except Case.DoesNotExist:
            return None, error_response("케이스를 찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)

        if case.status == Case.Status.PROCESSING:
            return None, error_response("이미 분석이 진행 중입니다", status_code=status.HTTP_409_CONFLICT)
        if hasattr(case, "confirmed_finding"):
            return None, error_response("확정된 케이스는 재분석할 수 없습니다", status_code=status.HTTP_409_CONFLICT)
        if case.status == Case.Status.PENDING_REVIEW:
            return None, error_response("검토 대기 중인 결과가 있습니다", status_code=status.HTTP_409_CONFLICT)
        if retry and case.status != Case.Status.FAILED:
            return None, error_response("실패한 분석만 재시도할 수 있습니다", status_code=status.HTTP_409_CONFLICT)
        if not retry and case.status not in (Case.Status.UPLOADED, Case.Status.FAILED):
            return None, error_response("현재 상태에서는 분석을 시작할 수 없습니다", status_code=status.HTTP_409_CONFLICT)

        case.status = Case.Status.PROCESSING
        case.current_step = Case.Step.UPLOADED
        case.analyzed_at = now
        case.completed_at = None
        case.last_progress_at = now
        case.analysis_task_id = ""
        case.analysis_error_code = ""
        case.analysis_error_message = ""
        if retry:
            case.retry_count += 1
        case.save(update_fields=[
            "status", "current_step", "analyzed_at", "completed_at", "last_progress_at",
            "analysis_task_id", "analysis_error_code", "analysis_error_message", "retry_count",
        ])

    try:
        async_result = run_case_analysis.delay(str(case.id))
    except Exception as exc:
        Case.objects.filter(id=case.id, status=Case.Status.PROCESSING).update(
            status=Case.Status.FAILED,
            analysis_error_code="QUEUE_UNAVAILABLE",
            analysis_error_message=str(exc)[:2000],
            analysis_task_id="",
            last_progress_at=timezone.now(),
        )
        return None, error_response(
            "분석 작업을 대기열에 등록하지 못했습니다",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    Case.objects.filter(id=case.id, status=Case.Status.PROCESSING).update(
        analysis_task_id=async_result.id,
    )
    case.refresh_from_db()
    return case, None


@extend_schema(tags=["cases"], responses={202: CaseDetailSerializer})
@api_view(["POST"])
@permission_classes([IsPathologist])
def predict_case(request, case_id):
    case, error = _queue_analysis(case_id, retry=False)
    if error:
        return error
    return Response(
        CaseDetailSerializer(case, context={"request": request}).data,
        status=status.HTTP_202_ACCEPTED,
    )


@extend_schema(tags=["cases"], responses={202: CaseDetailSerializer})
@api_view(["POST"])
@permission_classes([IsPathologist])
def retry_case_analysis(request, case_id):
    case, error = _queue_analysis(case_id, retry=True)
    if error:
        return error
    return Response(
        CaseDetailSerializer(case, context={"request": request}).data,
        status=status.HTTP_202_ACCEPTED,
    )


@extend_schema(tags=["cases"])
@api_view(["POST"])
@permission_classes([AllowAny])
def update_case_step(request, case_id):
    if not INTERNAL_CALLBACK_TOKEN or request.headers.get("X-Internal-Token") != INTERNAL_CALLBACK_TOKEN:
        return error_response("unauthorized", status_code=status.HTTP_401_UNAUTHORIZED)

    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return error_response("not found", status_code=status.HTTP_404_NOT_FOUND)

    step = request.data.get("step")
    if step not in Case.Step.values:
        return error_response("invalid step", status_code=status.HTTP_400_BAD_REQUEST)
    if case.status != Case.Status.PROCESSING:
        return error_response("case is not processing", status_code=status.HTTP_409_CONFLICT)

    case.current_step = step
    case.last_progress_at = timezone.now()
    case.save(update_fields=["current_step", "last_progress_at"])
    return Response({"status": "ok"})


@extend_schema(tags=["cases"], request=ReviewActionSerializer, responses={200: CaseDetailSerializer})
@api_view(["POST"])
@permission_classes([IsDoctor])
def review_case(request, case_id):
    """
    승인(action=confirm): 최신 AIAnalysisResult 값을 그대로 ConfirmedFinding에 저장.
    반려(action=edit): 의사가 넘긴 final_subtype/final_note로 ConfirmedFinding에 저장.
    둘 다 결과적으로 Case.status=confirmed — 별도의 "반려" 상태나 재분석 트리거는 없음.
    """
    try:
        case = Case.objects.select_related("confirmed_finding").get(id=case_id)
    except Case.DoesNotExist:
        return error_response("케이스를 찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)

    if hasattr(case, "confirmed_finding"):
        return error_response("이미 확정된 케이스입니다", status_code=status.HTTP_400_BAD_REQUEST)

    latest_result = case.ai_results.first()
    if latest_result is None:
        return error_response("AI 분석 결과가 없습니다", status_code=status.HTTP_400_BAD_REQUEST)

    serializer = ReviewActionSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    data = serializer.validated_data

    if data["action"] == "confirm":
        final_subtype = latest_result.prediction_label
        final_note = latest_result.treatment_note or ""
        log_action = CaseReviewLog.Action.CONFIRMED
    else:
        final_subtype = data["final_subtype"]
        final_note = data.get("final_note", "")
        log_action = CaseReviewLog.Action.EDITED

    with transaction.atomic():
        ConfirmedFinding.objects.create(
            case=case,
            based_on_result=latest_result,
            final_subtype=final_subtype,
            final_note=final_note,
            confirmed_by=request.user,
        )
        CaseReviewLog.objects.create(
            case=case,
            reviewer=request.user,
            action=log_action,
            subtype_at_time=final_subtype,
            note_at_time=final_note,
        )
        case.status = Case.Status.CONFIRMED
        case.save(update_fields=["status"])

    return Response(CaseDetailSerializer(case, context={"request": request}).data)


@extend_schema(tags=["cases"], responses={200: CaseDetailSerializer})
@api_view(["POST"])
@permission_classes([IsDoctor])
def release_case(request, case_id):
    """의사가 확정한 결과를 환자에게 공개하고 알림을 생성한다."""
    try:
        case = Case.objects.select_related("confirmed_finding", "patient").get(id=case_id)
    except Case.DoesNotExist:
        return error_response("케이스를 찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)

    finding = getattr(case, "confirmed_finding", None)
    if finding is None:
        return error_response("확정된 결과가 없습니다", status_code=status.HTTP_409_CONFLICT)
    if finding.released_at is not None:
        return error_response("이미 환자에게 공개된 결과입니다", status_code=status.HTTP_409_CONFLICT)

    is_confirmer = finding.confirmed_by_id == request.user.id
    is_assigned_doctor = PatientProfile.objects.filter(
        user_id=case.patient_id,
        assigned_doctor=request.user,
    ).exists()
    if not (is_confirmer or is_assigned_doctor):
        return error_response(
            "결과를 확정한 의사 또는 환자의 담당 의사만 공개할 수 있습니다",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    finding.released_by = request.user
    finding.released_at = timezone.now()
    finding.save(update_fields=["released_by", "released_at"])

    notify(
        recipient_id=case.patient_id,
        category="case_review",
        title="검사 결과가 도착했습니다",
        body=f"{case.specimen_id} 검사 결과를 확인해 주세요.",
        deep_link=f"/results/{case.id}",
    )
    return Response(CaseDetailSerializer(case, context={"request": request}).data)


@extend_schema(tags=["cases"], responses={200: PatientCaseResultSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsPatient])
def patient_result_list(request):
    results = (
        Case.objects.filter(
            patient=request.user,
            confirmed_finding__released_at__isnull=False,
        )
        .select_related("confirmed_finding")
        .order_by("-confirmed_finding__released_at")
    )
    return Response(PatientCaseResultSerializer(results, many=True).data)


@extend_schema(tags=["cases"])
@api_view(["GET"])
@permission_classes([IsDoctor])
def case_review_log_list(request, case_id):
    logs = CaseReviewLog.objects.filter(case_id=case_id).select_related("reviewer")
    from .serializers import CaseReviewLogSerializer
    return Response(CaseReviewLogSerializer(logs, many=True).data)


@extend_schema(tags=["cases"])
@api_view(["GET", "POST"])
@permission_classes([IsDoctor])
def case_finding_list_create(request, case_id):
    if request.method == "GET":
        findings = CaseFinding.objects.filter(case_id=case_id, user=request.user)
        return Response(CaseFindingSerializer(findings, many=True).data)

    serializer = CaseFindingSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    finding = CaseFinding.objects.create(case_id=case_id, user=request.user, **serializer.validated_data)
    return Response(CaseFindingSerializer(finding).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["cases"])
@api_view(["DELETE"])
@permission_classes([IsDoctor])
def case_finding_delete(request, case_id, finding_id):
    deleted, _ = CaseFinding.objects.filter(id=finding_id, case_id=case_id, user=request.user).delete()
    if not deleted:
        return error_response("찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["cases"])
@api_view(["POST"])
@permission_classes([IsDoctor])
def toggle_favorite(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return error_response("케이스를 찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)

    favorite = CaseFavorite.objects.filter(user=request.user, case=case).first()
    if favorite:
        favorite.delete()
        return Response({"is_favorite": False})
    CaseFavorite.objects.create(user=request.user, case=case)
    return Response({"is_favorite": True})


@extend_schema(tags=["cases"])
@api_view(["POST"])
@permission_classes([IsPathologist])
def get_upload_url(request):
    filename = request.data.get("filename")
    if not filename:
        return error_response("filename은 필수입니다", status_code=status.HTTP_400_BAD_REQUEST)
    return Response(generate_upload_url(filename))
