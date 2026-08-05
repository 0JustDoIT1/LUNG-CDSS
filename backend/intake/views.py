import secrets

from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsNurse, IsPatient

from .models import IntakeForm
from .serializers import IntakeFormSerializer, IntakeFormUpdateSerializer
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
    form, _ = IntakeForm.objects.get_or_create(
        patient=request.user,
        defaults={"content": {"status": "draft", "questions": []}},
    )

    if request.method == "GET":
        return Response(IntakeFormSerializer(form).data)

    serializer = IntakeFormUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    content = serializer.validated_data["content"]
    if content is None:
        return error_response("content는 필수입니다", status_code=status.HTTP_400_BAD_REQUEST)
    form.content = content
    form.submitted_at = timezone.now() if content["status"] == "submitted" else None
    form.save(update_fields=["content", "submitted_at", "updated_at"])
    return Response(IntakeFormSerializer(form).data)


@extend_schema(tags=["intake"])
@api_view(["GET"])
@permission_classes([IsNurse])
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
