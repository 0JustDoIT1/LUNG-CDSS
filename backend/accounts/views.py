import random
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

from .permissions import IsGuardian, IsPatient

from .models import Hospital, PatientAuth, PatientProfile, StaffAuth, User
from .models import GuardianLink
from .serializers import (
    GuardianLinkSerializer,
    GuardianRegisterSerializer,
    PhoneVerifyConfirmSerializer,
    PhoneVerifyRequestSerializer,
    SocialLoginSerializer,
    StaffLoginSerializer,
    StaffSignupSerializer,
)
from .services import SocialTokenError, verify_social_token
from core.responses import error_response, validation_error_response

SMS_CODE_TTL = 180  # 3분
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


@extend_schema(tags=["accounts"], request=PhoneVerifyRequestSerializer,
                responses={200: OpenApiResponse(description="SMS 발송됨, expires_in 반환")})
@api_view(["POST"])
@permission_classes([AllowAny])
def phone_verify_request(request):
    serializer = PhoneVerifyRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    phone_number = serializer.validated_data["phone_number"]

    if PatientAuth.objects.filter(phone_number=phone_number).exists():
        return error_response("이미 등록된 번호입니다", status_code=status.HTTP_409_CONFLICT)

    code = f"{random.randint(0, 999999):06d}"
    cache.set(f"sms_code:{phone_number}", code, timeout=SMS_CODE_TTL)

    # TODO: 실제 SMS 발송 연동 (NHN Cloud / 알리고 등). 지금은 로그로만 확인.
    print(f"[SMS] {phone_number} 인증번호: {code}")

    return Response({"expires_in": SMS_CODE_TTL})


@extend_schema(tags=["accounts"], request=PhoneVerifyConfirmSerializer,
                responses={201: OpenApiResponse(description="가입 완료, JWT 발급")})
@api_view(["POST"])
@permission_classes([AllowAny])
def phone_verify_confirm(request):
    serializer = PhoneVerifyConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    data = serializer.validated_data
    phone_number = data["phone_number"]

    cached_code = cache.get(f"sms_code:{phone_number}")
    if cached_code is None:
        return error_response("인증번호가 만료되었습니다. 재전송해주세요", status_code=status.HTTP_400_BAD_REQUEST)
    if cached_code != data["code"]:
        return error_response("인증번호가 일치하지 않습니다", status_code=status.HTTP_400_BAD_REQUEST)

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
        phone_verified_at=timezone.now(),
    )

    # TODO: 실명+생년월일+전화번호 기준 병원 환자DB 자동매칭 로직 연동.
    # 매칭 안 되면 프론트에서 초대코드 입력 화면으로 유도.
    PatientProfile.objects.create(user=user, birth_date=data["birth_date"], hospital=hospital)

    cache.delete(f"sms_code:{phone_number}")
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
