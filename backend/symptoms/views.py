from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPatient
from core.responses import error_response, validation_error_response

from .models import SymptomCheck
from .rules import compute_risk_level
from .serializers import SymptomCheckSerializer, SymptomSubmitSerializer


@extend_schema(tags=["symptoms"], request=SymptomSubmitSerializer, responses={201: SymptomCheckSerializer})
@api_view(["POST"])
@permission_classes([IsPatient])
def submit_check(request):
    """환자 본인만 사용하는 일일 증상 기록을 저장한다."""
    today = timezone.localdate()
    if SymptomCheck.objects.filter(patient=request.user, checked_at__date=today).exists():
        return error_response("오늘 체크를 완료했습니다", status_code=status.HTTP_409_CONFLICT)

    serializer = SymptomSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    validated_data = serializer.validated_data
    memo = validated_data.pop("memo", "")
    symptoms = validated_data
    risk_level = compute_risk_level(symptoms)

    check = SymptomCheck.objects.create(
        patient=request.user,
        symptoms=symptoms,
        memo=memo,
        risk_level=risk_level,
    )
    return Response(SymptomCheckSerializer(check).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["symptoms"], responses={200: SymptomCheckSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsPatient])
def my_checks(request):
    """현재 로그인한 환자 본인의 기록만 최신순으로 반환한다."""
    checks = SymptomCheck.objects.filter(patient=request.user)
    return Response(SymptomCheckSerializer(checks, many=True).data)
