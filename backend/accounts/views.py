import uuid

from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .permissions import IsDoctor, IsGuardian, IsMedicalStaff, IsPatient

from .models import DeviceToken, DoctorProfile, GuardianLink, Hospital, NotificationPreference, PatientAuth, PatientProfile, StaffAuth, User
from .serializers import (
    DeviceTokenSerializer,
    DoctorProfileUpdateSerializer,
    GuardianLinkSerializer,
    GuardianRegisterSerializer,
    HospitalSerializer,
    NotificationPreferenceSerializer,
    PatientProfileSerializer,
    PatientRegisterSerializer,
    SocialLoginSerializer,
    StaffLoginSerializer,
    StaffSignupSerializer,
)
from .services import SocialTokenError, verify_social_token
from core.responses import error_response, validation_error_response

SIGNUP_SESSION_TTL = 600  # 10분


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


# ── 의사/간호사/병리사 ────────────────────────────────────────────────

@extend_schema(tags=["accounts"], request=StaffSignupSerializer,
                responses={201: OpenApiResponse(description="가입 성공, JWT 발급")})
@api_view(["POST"])
@permission_classes([AllowAny])
def staff_signup(request):
    serializer = StaffSignupSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    user = serializer.save()
    tokens = _issue_tokens(user)
    return Response({**tokens, "role": user.role, "name": user.name}, status=status.HTTP_201_CREATED)


@extend_schema(tags=["accounts"], request=StaffLoginSerializer,
                responses={200: OpenApiResponse(description="로그인 성공, JWT 발급")})
@api_view(["POST"])
@permission_classes([AllowAny])
def staff_login(request):
    serializer = StaffLoginSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    email = serializer.validated_data["email"]
    password = serializer.validated_data["password"]

    staff_auth = StaffAuth.objects.select_related("user").filter(email=email).first()
    if staff_auth is None or not staff_auth.check_password(password):
        return error_response("이메일 또는 비밀번호가 올바르지 않습니다", status_code=status.HTTP_401_UNAUTHORIZED)

    user = staff_auth.user
    tokens = _issue_tokens(user)
    return Response({**tokens, "role": user.role, "name": user.name})


# ── 환자: 소셜로그인 ──────────────────────────────────────────────────

@extend_schema(tags=["accounts"], request=SocialLoginSerializer,
                responses={200: OpenApiResponse(description="기존회원=JWT / 신규회원=signup_token")})
@api_view(["POST"])
@permission_classes([AllowAny])
def social_login(request):
    serializer = SocialLoginSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    provider = serializer.validated_data["provider"]
    token = serializer.validated_data["token"]

    try:
        verified = verify_social_token(provider, token)
    except SocialTokenError as e:
        return error_response(str(e), status_code=status.HTTP_401_UNAUTHORIZED)

    social_uid = verified["social_uid"]
    patient_auth = PatientAuth.objects.select_related("user").filter(
        social_provider=provider, social_uid=social_uid
    ).first()

    if patient_auth is not None:
        # 기존 회원 재로그인 — 본인인증 재노출 없이 바로 토큰 발급
        tokens = _issue_tokens(patient_auth.user)
        return Response({**tokens, "role": "patient", "is_new_user": False})

    # 신규 회원 — 본인인증(SMS) 단계로 넘어가기 위한 임시 세션 발급
    signup_token = uuid.uuid4().hex
    cache.set(
        f"signup_session:{signup_token}",
        {"provider": provider, "social_uid": social_uid, "name": verified.get("name")},
        timeout=SIGNUP_SESSION_TTL,
    )
    return Response({"is_new_user": True, "signup_token": signup_token})


@extend_schema(tags=["accounts"], request=PatientRegisterSerializer,
                responses={201: OpenApiResponse(description="가입 완료, JWT 발급")})
@api_view(["POST"])
@permission_classes([AllowAny])
def patient_register(request):
    """
    SMS 인증코드 확인 단계는 뺐다(발신번호 사전등록 심사 문제로 당장 불가) —
    번호는 여전히 필수로 받되, 실제 본인확인 없이 바로 가입을 완료한다.
    """
    serializer = PatientRegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    data = serializer.validated_data
    phone_number = data["phone_number"]

    if PatientAuth.objects.filter(phone_number=phone_number).exists():
        return error_response("이미 등록된 번호입니다", status_code=status.HTTP_409_CONFLICT)

    session = cache.get(f"signup_session:{data['signup_token']}")
    if session is None:
        return error_response("가입 세션이 만료되었습니다. 처음부터 다시 시도해주세요", status_code=status.HTTP_400_BAD_REQUEST)

    try:
        hospital = Hospital.objects.get(id=data["hospital_id"])
    except Hospital.DoesNotExist:
        return error_response("존재하지 않는 병원입니다", status_code=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_patient(name=session.get("name") or "환자")
    PatientAuth.objects.create(
        user=user,
        social_provider=session["provider"],
        social_uid=session["social_uid"],
        phone_number=phone_number,
    )

    # 병원 기존 환자DB와의 자동매칭 로직 없음(의도적) — 서비스 시작 시점부터
    # 모든 환자가 이 시스템으로 신규가입하는 전제라, 연결할 "과거 기록" 자체가
    # 존재하지 않음. 추후 기존 시스템에서 데이터 이관이 필요해지면 그때 재검토.
    PatientProfile.objects.create(
        user=user, birth_date=data["birth_date"], hospital=hospital, gender=data.get("gender"),
    )

    cache.delete(f"signup_session:{data['signup_token']}")

    tokens = _issue_tokens(user)
    return Response({**tokens, "role": "patient", "is_new_user": True}, status=status.HTTP_201_CREATED)


# ── 공통: 로그아웃 (의사/간호사/병리사/환자 전체) ────────────────────────

@extend_schema(tags=["accounts"], responses={205: OpenApiResponse(description="로그아웃 완료")})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    refresh 토큰을 서버측에서 블랙리스트에 등록해 무효화한다.
    클라이언트가 access 토큰을 그냥 지우는 것만으로는 refresh가 살아있는 채로
    남아 탈취 시 재발급이 가능하므로, 명시적으로 서버에 무효화 요청을 받는다.
    """
    refresh_token = request.data.get("refresh")
    if not refresh_token:
        return error_response("refresh 토큰이 필요합니다", status_code=status.HTTP_400_BAD_REQUEST)

    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
    except TokenError:
        return error_response("이미 만료되었거나 유효하지 않은 토큰입니다", status_code=status.HTTP_400_BAD_REQUEST)

    return Response(status=status.HTTP_205_RESET_CONTENT)


# ── 보호자 연동 ───────────────────────────────────────────────────────

def _generate_invite_code(length=6):
    import random
    import string
    alphabet = string.ascii_uppercase + string.digits
    while True:
        candidate = "".join(random.choices(alphabet, k=length))
        if not GuardianLink.objects.filter(invite_code=candidate).exists():
            return candidate


@api_view(["POST"])
@permission_classes([IsPatient])
def guardian_invite(request):
    """
    미등록(accepted_at=NULL) 상태인 기존 코드가 있으면 교체, 없으면 새로 생성.
    이미 등록완료된 보호자 링크는 그대로 유지(환자당 보호자 여러명 허용).
    """
    pending = GuardianLink.objects.filter(patient=request.user, accepted_at__isnull=True).first()
    if pending:
        pending.invite_code = _generate_invite_code()
        pending.save(update_fields=["invite_code"])
        link = pending
    else:
        link = GuardianLink.objects.create(patient=request.user, invite_code=_generate_invite_code())

    return Response(GuardianLinkSerializer(link).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsPatient])
def guardian_link_list(request):
    links = GuardianLink.objects.filter(patient=request.user)
    return Response(GuardianLinkSerializer(links, many=True).data)


@api_view(["DELETE"])
@permission_classes([IsPatient])
def guardian_unlink(request, link_id):
    deleted, _ = GuardianLink.objects.filter(id=link_id, patient=request.user).delete()
    if not deleted:
        return error_response("찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([AllowAny])
def guardian_register(request):
    serializer = GuardianRegisterSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    data = serializer.validated_data
    link = GuardianLink.objects.filter(invite_code=data["invite_code"], accepted_at__isnull=True).first()
    if link is None:
        return error_response("유효하지 않거나 이미 사용된 코드입니다", status_code=status.HTTP_400_BAD_REQUEST)

    guardian_user = User.objects.create(role=User.Role.GUARDIAN, name=data["name"])
    guardian_user.set_unusable_password()
    guardian_user.save()

    link.guardian = guardian_user
    link.accepted_at = timezone.now()
    link.save(update_fields=["guardian", "accepted_at"])

    tokens = _issue_tokens(guardian_user)
    return Response({**tokens, "role": "guardian"}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsGuardian])
def guardian_my_patients(request):
    links = GuardianLink.objects.filter(guardian=request.user, accepted_at__isnull=False).select_related("patient")
    return Response([{"patient_id": str(l.patient_id), "patient_name": l.patient.name} for l in links])


@api_view(["GET"])
@permission_classes([IsGuardian])
def guardian_patient_summary(request, patient_id):
    """검사결과 상태 / 다음예약 / 최근 증상체크 요약. 열람권한(GuardianLink) 먼저 확인."""
    if not GuardianLink.objects.filter(
        guardian=request.user, patient_id=patient_id, accepted_at__isnull=False
    ).exists():
        return error_response("권한이 없습니다", status_code=status.HTTP_403_FORBIDDEN)

    from appointments.models import Appointment
    from cases.models import Case
    from symptoms.models import SymptomCheck

    latest_case = Case.objects.filter(patient_id=patient_id).order_by("-uploaded_at").first()
    next_appt = Appointment.objects.filter(
        patient_id=patient_id, status__in=["confirmed", "reminded_d7", "reminded_d1"]
    ).order_by("confirmed_slot").first()
    latest_check = SymptomCheck.objects.filter(patient_id=patient_id).order_by("-checked_at").first()

    return Response({
        "case_status": latest_case.status if latest_case else None,
        "next_appointment": next_appt.confirmed_slot if next_appt else None,
        "latest_risk_level": latest_check.risk_level if latest_check else None,
        "latest_checked_at": latest_check.checked_at if latest_check else None,
    })


# ── 환자 프로필 (이름/환자번호/소속병원 읽기전용, 생년월일/성별만 수정가능) ──

@extend_schema(tags=["accounts"], responses={200: PatientProfileSerializer})
@api_view(["GET", "PUT"])
@permission_classes([IsPatient])
def patient_profile(request):
    profile = PatientProfile.objects.select_related("user", "hospital").get(user=request.user)

    if request.method == "GET":
        return Response(PatientProfileSerializer(profile).data)

    serializer = PatientProfileSerializer(profile, data=request.data, partial=True)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    serializer.save()
    return Response(serializer.data)


# ── 의사 프로필 (사진/태그) ───────────────────────────────────────────

@api_view(["GET", "PUT"])
@permission_classes([IsDoctor])
def doctor_profile(request):
    profile = DoctorProfile.objects.get(user=request.user)

    if request.method == "GET":
        return Response(DoctorProfileUpdateSerializer(profile).data)

    serializer = DoctorProfileUpdateSerializer(profile, data=request.data, partial=True)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    serializer.save()
    return Response(serializer.data)


# ── 병원 정보 (약도/전화/주소) — 병원 1곳 고정이라 파라미터 없이 조회 ──────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def hospital_info(request):
    hospital = Hospital.objects.first()
    if hospital is None:
        return error_response("등록된 병원이 없습니다", status_code=status.HTTP_404_NOT_FOUND)
    return Response(HospitalSerializer(hospital).data)


# ── 알림 설정 (카테고리별 on/off) ─────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_preference_list(request):
    """설정 안 한 카테고리는 기본값 enabled=True로 채워서 반환."""
    existing = {p.category: p.enabled for p in NotificationPreference.objects.filter(user=request.user)}
    all_categories = ["medication", "appointment", "chat", "triage", "case_review"]
    return Response([
        {"category": c, "enabled": existing.get(c, True)} for c in all_categories
    ])


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def notification_preference_update(request):
    serializer = NotificationPreferenceSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    data = serializer.validated_data
    pref, _ = NotificationPreference.objects.update_or_create(
        user=request.user, category=data["category"], defaults={"enabled": data["enabled"]},
    )
    return Response({"category": pref.category, "enabled": pref.enabled})


# ── FCM 디바이스 토큰 등록 ────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_device_token(request):
    serializer = DeviceTokenSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    data = serializer.validated_data
    DeviceToken.objects.update_or_create(
        user=request.user, app_type=data["app_type"], platform=data["platform"],
        defaults={"fcm_token": data["fcm_token"]},
    )
    return Response(status=status.HTTP_201_CREATED)


# ── 의료진: 환자 목록 조회 (복약스케줄 등록 시 patient UUID 선택용) ──────────

@extend_schema(tags=["accounts"])
@api_view(["GET"])
@permission_classes([IsMedicalStaff])
def staff_patient_list(request):
    """
    병원이 1곳으로 고정된 전제라 별도 필터링 없이 전체 활성 환자를 반환한다.
    검색어(search)로 이름 부분일치 필터 가능.
    """
    queryset = PatientProfile.objects.select_related("user").filter(user__is_active=True)

    search = request.query_params.get("search")
    if search:
        queryset = queryset.filter(user__name__icontains=search.strip())

    results = []
    for profile in queryset.order_by("user__name"):
        results.append({
            "id": str(profile.user_id),
            "name": profile.user.name,
            "patient_number": profile.patient_number,
            "birth_date": profile.birth_date,
        })
    return Response(results)
