from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsNurse, IsPatient
from communication.services import notify

from .models import SymptomCheck
from .rules import compute_risk_level
from .serializers import SymptomCheckSerializer, SymptomSubmitSerializer


@extend_schema(tags=["symptoms"], request=SymptomSubmitSerializer, responses={201: SymptomCheckSerializer})
@api_view(["POST"])
@permission_classes([IsPatient])
def submit_check(request):
    today = timezone.localdate()
    if SymptomCheck.objects.filter(patient=request.user, checked_at__date=today).exists():
        return Response({"error": "오늘 체크는 완료되었습니다"}, status=status.HTTP_409_CONFLICT)

    serializer = SymptomSubmitSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    symptoms = serializer.validated_data
    risk_level = compute_risk_level(symptoms)

    check = SymptomCheck.objects.create(
        patient=request.user,
        symptoms=symptoms,
        risk_level=risk_level,
        # 열람권한 설정과 무관하게, RED는 항상 간호사에게 전달됨(정책)
        visible_to_nurse=(risk_level == SymptomCheck.RiskLevel.RED) or _current_visibility(request.user),
    )

    if risk_level in (SymptomCheck.RiskLevel.RED, SymptomCheck.RiskLevel.YELLOW):
        _notify_care_team(check)

    return Response(SymptomCheckSerializer(check).data, status=status.HTTP_201_CREATED)


def _current_visibility(user):
    last = SymptomCheck.objects.filter(patient=user).order_by("-checked_at").first()
    return last.visible_to_nurse if last else True


def _notify_care_team(check):
    from accounts.models import NurseProfile

    doctor = getattr(check.patient, "patient_profile", None)
    doctor = doctor.assigned_doctor if doctor else None
    department = getattr(getattr(doctor, "doctor_profile", None), "department", None)

    recipients = []
    if department:
        recipients += list(
            NurseProfile.objects.filter(department=department).values_list("user_id", flat=True)
        )
    if doctor:
        recipients.append(doctor.id)

    for user_id in set(recipients):
        notify(
            recipient_id=user_id,
            category="triage",
            title=f"{check.patient.name}님 증상체크 {check.risk_level.upper()}",
            body="즉시 확인이 필요합니다" if check.risk_level == "red" else "확인이 필요합니다",
            deep_link=f"/symptoms/{check.id}",
        )


@extend_schema(tags=["symptoms"], responses={200: SymptomCheckSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsPatient])
def my_checks(request):
    checks = SymptomCheck.objects.filter(patient=request.user)
    return Response(SymptomCheckSerializer(checks, many=True).data)


@extend_schema(tags=["symptoms"])
@api_view(["PATCH"])
@permission_classes([IsPatient])
def update_visibility(request):
    visible = request.data.get("visible_to_nurse")
    if visible is None:
        return Response({"error": "visible_to_nurse는 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

    # 마지막 체크뿐 아니라, 이후 새로 생성되는 체크에도 적용되도록 프로필 레벨 설정이 이상적이나
    # 지금 스키마는 체크 단위 필드라 최근 기록에 반영 (RED는 이후 로직에서 무시되므로 안전)
    updated = SymptomCheck.objects.filter(patient=request.user).order_by("-checked_at").first()
    if updated:
        updated.visible_to_nurse = bool(visible)
        updated.save(update_fields=["visible_to_nurse"])

    return Response({"visible_to_nurse": bool(visible)})


@extend_schema(tags=["symptoms"], responses={200: SymptomCheckSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsNurse])
def nurse_visible_checks(request):
    """간호사가 조회 가능한(visible_to_nurse=True 이거나 RED인) 최근 증상체크 목록."""
    from django.db.models import Q

    checks = SymptomCheck.objects.filter(
        Q(visible_to_nurse=True) | Q(risk_level=SymptomCheck.RiskLevel.RED)
    ).select_related("patient")
    return Response(SymptomCheckSerializer(checks, many=True).data)


@extend_schema(tags=["symptoms"], responses={200: SymptomCheckSerializer})
@api_view(["POST"])
@permission_classes([IsNurse])
def mark_reviewed(request, check_id):
    try:
        check = SymptomCheck.objects.get(id=check_id)
    except SymptomCheck.DoesNotExist:
        return Response({"error": "찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    check.nurse_reviewed = True
    check.nurse_reviewed_by = request.user
    check.nurse_reviewed_at = timezone.now()
    check.save(update_fields=["nurse_reviewed", "nurse_reviewed_by", "nurse_reviewed_at"])
    return Response(SymptomCheckSerializer(check).data)
