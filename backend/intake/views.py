import secrets
from copy import deepcopy

from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsDoctorOrNurse, IsNurse, IsPatient

from .models import IntakeForm
from .serializers import IntakeContentSerializer, IntakeFormSerializer, IntakeFormUpdateSerializer
from .services import get_or_prepare_intake_form
from core.responses import error_response, validation_error_response

QR_TOKEN_TTL = 300  # 5분


@extend_schema_view(
    get=extend_schema(tags=["intake"], responses={200: IntakeFormSerializer}),
    put=extend_schema(
        tags=["intake"], request=IntakeFormUpdateSerializer,
        responses={200: IntakeFormSerializer},
    ),
)
@api_view(["GET", "PUT"])
@permission_classes([IsPatient])
def my_intake_form(request):
    form = get_or_prepare_intake_form(request.user)

    if request.method == "GET":
        return Response(IntakeFormSerializer(form).data)

    serializer = IntakeFormUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    update_content = serializer.validated_data["content"]
    stored_questions = form.content.get("questions", [])
    incoming_questions = update_content["questions"]
    stored_ids = [question["question_id"] for question in stored_questions]
    incoming_ids = [question["question_id"] for question in incoming_questions]
    if incoming_ids != stored_ids:
        return validation_error_response({
            "content": {"questions": ["question_id와 질문 순서는 변경할 수 없습니다."]},
        })

    content = deepcopy(form.content)
    content["status"] = update_content["status"]
    for stored_question, incoming_question in zip(content["questions"], incoming_questions):
        stored_question["answer"] = incoming_question["answer"]

    content_serializer = IntakeContentSerializer(data=content)
    if not content_serializer.is_valid():
        return validation_error_response(content_serializer.errors)
    content = content_serializer.validated_data

    form.content = content
    form.submitted_at = timezone.now() if content["status"] == "submitted" else None
    form.save(update_fields=["content", "submitted_at", "updated_at"])
    return Response(IntakeFormSerializer(form).data)


@extend_schema(tags=["intake"])
@api_view(["GET"])
@permission_classes([IsDoctorOrNurse])
def patient_intake_form(request, patient_id):
    """간호사/의사가 환자 상세정보 화면에서 문진표 조회 (읽기전용)."""
    form = IntakeForm.objects.filter(patient_id=patient_id).first()
    if not form:
        return Response({"content": None})
    return Response(IntakeFormSerializer(form).data)


@extend_schema(tags=["intake"])
@api_view(["POST"])
@permission_classes([IsPatient])
def issue_qr_token(request):
    """
    프로필+문진표 QR 공유용 임시 토큰. Postgres에 영구저장하지 않고
    Redis(캐시)에 TTL 5분으로만 존재 — 만료되면 자동으로 조회 불가.
    """
    token = secrets.token_hex(16)
    cache.set(f"qr_token:{token}", str(request.user.id), timeout=QR_TOKEN_TTL)
    return Response({"token": token, "expires_in": QR_TOKEN_TTL})


@extend_schema(tags=["intake"])
@api_view(["GET"])
@permission_classes([IsNurse])
def resolve_qr_token(request, token):
    """
    간호사가 QR을 스캔했을 때 호출. 프로필+문진표 요약만 반환하고,
    방문처리 같은 상태변경은 여기서 하지 않는다 (순수 조회용).
    """
    patient_id = cache.get(f"qr_token:{token}")
    if patient_id is None:
        return error_response("QR이 만료되었거나 유효하지 않습니다", status_code=status.HTTP_404_NOT_FOUND)

    from accounts.models import PatientProfile

    profile = PatientProfile.objects.select_related("user").filter(user_id=patient_id).first()
    if not profile:
        return error_response("환자 정보를 찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)

    form = IntakeForm.objects.filter(patient_id=patient_id).first()

    return Response({
        "name": profile.user.name,
        "patient_number": profile.patient_number,
        "birth_date": profile.birth_date,
        "intake_form": form.content if form else None,
    })
