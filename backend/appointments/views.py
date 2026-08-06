import datetime

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import DoctorOffDay, DoctorProfile, DoctorWeeklySchedule, User
from accounts.permissions import IsDoctor, IsNurse, IsPatient
from communication.services import notify
from clinical.services import record_audit

from .models import Appointment
from .serializers import (
    AppointmentCreateSerializer,
    AppointmentSerializer,
    AppointmentSlotListSerializer,
    DepartmentOptionSerializer,
    DoctorOptionSerializer,
)
from core.responses import error_response, validation_error_response

DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SLOTS_AM = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]
SLOTS_PM = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]


@extend_schema(tags=["appointments"], responses={200: DepartmentOptionSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsPatient])
def department_list(request):
    departments = DoctorProfile.objects.values_list("department", flat=True).distinct()
    return Response([
        {"code": department, "name": department}
        for department in sorted(set(departments))
    ])


@extend_schema(
    tags=["appointments"],
    parameters=[OpenApiParameter("department", str, OpenApiParameter.QUERY, required=True)],
    responses={200: DoctorOptionSerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsPatient])
def doctor_list(request):
    department = request.query_params.get("department")
    if not department:
        return error_response("department는 필수입니다", status_code=status.HTTP_400_BAD_REQUEST)

    profiles = DoctorProfile.objects.filter(department=department).select_related("user")
    assigned_doctor_id = getattr(getattr(request.user, "patient_profile", None), "assigned_doctor_id", None)

    data = []
    for profile in profiles:
        data.append({
            "id": str(profile.user_id),
            "name": profile.user.name,
            "department": profile.department,
            "photo_url": profile.photo_url,
            "specialty_tags": profile.specialty_tags,
            "is_assigned": profile.user_id == assigned_doctor_id,
            "weekly_schedule": list(
                DoctorWeeklySchedule.objects.filter(doctor_id=profile.user_id)
                .values("day_of_week", "period", "available")
            ),
        })
    # 담당의를 맨 위로
    data.sort(key=lambda d: not d["is_assigned"])
    return Response(data)


def _available_slots_for_date(doctor_id, date):
    day_code = DAY_CODES[date.weekday()]

    if DoctorOffDay.objects.filter(doctor_id=doctor_id, date=date).exists():
        return []

    weekly = {
        row["period"]: row["available"]
        for row in DoctorWeeklySchedule.objects.filter(doctor_id=doctor_id, day_of_week=day_code).values(
            "period", "available"
        )
    }

    candidates = []
    if weekly.get("am", True):
        candidates += SLOTS_AM
    if weekly.get("pm", True):
        candidates += SLOTS_PM

    taken = set(
        Appointment.objects.filter(
            doctor_id=doctor_id,
            status__in=[
                Appointment.Status.REQUESTED, Appointment.Status.CONFIRMED,
                Appointment.Status.REMINDED_D7, Appointment.Status.REMINDED_D1,
            ],
        )
        .filter(Q(confirmed_slot__date=date) | Q(requested_at_slot__date=date))
        .values_list("requested_at_slot__time", flat=True)
    )
    taken_str = {t.strftime("%H:%M") for t in taken if t}

    return [slot for slot in candidates if slot not in taken_str]


def _slot_response_for_date(doctor_id, date):
    available = set(_available_slots_for_date(doctor_id, date))
    slots = []
    for time_str in SLOTS_AM + SLOTS_PM:
        hour, minute = map(int, time_str.split(":"))
        slot_at = timezone.make_aware(
            datetime.datetime.combine(date, datetime.time(hour, minute)),
            timezone.get_current_timezone(),
        )
        is_available = time_str in available and slot_at > timezone.now()
        slots.append({
            "time": time_str,
            "datetime": slot_at,
            "status": "available" if is_available else "closed",
        })
    return {"date": date, "timezone": settings.TIME_ZONE, "slots": slots}


@extend_schema(
    tags=["appointments"],
    parameters=[
        OpenApiParameter("date", datetime.date, OpenApiParameter.QUERY, required=True),
    ],
    responses={200: AppointmentSlotListSerializer},
)
@api_view(["GET"])
@permission_classes([IsPatient])
def available_slots(request, doctor_id):
    date_str = request.query_params.get("date")
    if not date_str:
        return error_response("date는 필수입니다 (YYYY-MM-DD)", status_code=status.HTTP_400_BAD_REQUEST)
    try:
        date = datetime.date.fromisoformat(date_str)
    except ValueError:
        return error_response("date는 YYYY-MM-DD 형식이어야 합니다.", status_code=status.HTTP_400_BAD_REQUEST)
    get_object_or_404(User, id=doctor_id, role=User.Role.DOCTOR, is_active=True)
    return Response(AppointmentSlotListSerializer(_slot_response_for_date(doctor_id, date)).data)


@extend_schema(tags=["appointments"], request=AppointmentCreateSerializer, responses={201: AppointmentSerializer})
@api_view(["POST"])
@permission_classes([IsPatient])
def create_appointment(request):
    """
    슬롯 충돌은 여기서(신청 시점) 막는다 — 간호사 큐 단계에서 충돌을 다시
    처리할 필요가 없도록. 이미 마감된 슬롯이면 신청 자체가 거절됨.
    """
    serializer = AppointmentCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)

    data = serializer.validated_data
    slot = data["requested_at_slot"]
    doctor = get_object_or_404(User, id=data["doctor_id"], role="doctor")

    if slot <= timezone.now():
        return error_response("지난 시간에는 예약할 수 없습니다.", status_code=status.HTTP_400_BAD_REQUEST)

    doctor_department = DoctorProfile.objects.filter(user=doctor).values_list("department", flat=True).first()
    if doctor_department != data["department"]:
        return error_response("의사의 진료과와 요청한 진료과가 일치하지 않습니다.", status_code=status.HTTP_400_BAD_REQUEST)

    available = _available_slots_for_date(doctor.id, slot.date())
    if slot.strftime("%H:%M") not in available:
        return error_response("선택하신 시간은 더 이상 예약할 수 없습니다", status_code=status.HTTP_409_CONFLICT)

    try:
        with transaction.atomic():
            appointment = Appointment.objects.create(
                patient=request.user,
                doctor=doctor,
                department=data["department"],
                requested_at_slot=slot,
            )
    except IntegrityError:
        return error_response(
            "선택한 시간은 다른 예약에서 먼저 선점되었습니다.",
            status_code=status.HTTP_409_CONFLICT,
        )
    notify(
        recipient_id=doctor.id,
        category="appointment",
        title="새 예약 신청",
        body=f"{request.user.name}님이 {slot.strftime('%m월 %d일 %H:%M')} 예약을 신청했습니다.",
        deep_link=f"/doctor-dashboard/schedule?appointment={appointment.id}",
    )
    return Response(AppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["appointments"], responses={200: AppointmentSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsPatient])
def my_appointments(request):
    appointments = Appointment.objects.filter(patient=request.user).exclude(status=Appointment.Status.CANCELLED)
    return Response(AppointmentSerializer(appointments, many=True).data)


@extend_schema(tags=["appointments"])
@api_view(["POST"])
@permission_classes([IsPatient])
def cancel_appointment(request, appointment_id):
    appt = get_object_or_404(Appointment, id=appointment_id, patient=request.user)
    appt.status = Appointment.Status.CANCELLED
    appt.save(update_fields=["status"])
    notify(
        recipient_id=appt.doctor_id,
        category="appointment",
        title="예약 취소",
        body=f"{request.user.name}님이 {appt.department} 예약을 취소했습니다.",
        deep_link=f"/appointments/{appt.id}",
    )
    return Response(AppointmentSerializer(appt).data)


# ── 간호사: 예약요청 큐 ──────────────────────────────────────────────

@extend_schema(tags=["appointments"], responses={200: AppointmentSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsNurse])
def request_queue(request):
    from accounts.models import NurseProfile
    department = NurseProfile.objects.filter(user=request.user).values_list("department", flat=True).first()
    queue = Appointment.objects.filter(status=Appointment.Status.REQUESTED, department=department)
    return Response(AppointmentSerializer(queue, many=True).data)


@extend_schema(tags=["appointments"])
@api_view(["POST"])
@permission_classes([IsNurse])
def process_request(request, appointment_id):
    action = request.data.get("action")
    if action not in ("approve", "reject"):
        return error_response("action은 approve 또는 reject여야 합니다", status_code=status.HTTP_400_BAD_REQUEST)

    appt = get_object_or_404(Appointment, id=appointment_id, status=Appointment.Status.REQUESTED)

    if action == "approve":
        appt.status = Appointment.Status.CONFIRMED
        appt.confirmed_slot = appt.requested_at_slot
    else:
        appt.status = Appointment.Status.CANCELLED

    appt.processed_by = request.user
    appt.save(update_fields=["status", "confirmed_slot", "processed_by"])

    notify(
        recipient_id=appt.patient_id,
        category="appointment",
        title="예약 확정" if action == "approve" else "예약 반려",
        body=f"{appt.department} 예약이 {'확정' if action == 'approve' else '반려'}되었습니다",
        deep_link=f"/appointments/{appt.id}",
    )
    return Response(AppointmentSerializer(appt).data)


# ── 간호사: 진료관리(오늘 방문/미방문) ──────────────────────────────

@extend_schema(tags=["appointments"], responses={200: AppointmentSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsNurse])
def today_visits(request):
    from accounts.models import NurseProfile
    department = NurseProfile.objects.filter(user=request.user).values_list("department", flat=True).first()
    today = timezone.localdate()
    appts = Appointment.objects.filter(
        department=department,
        status__in=[Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN,
                    Appointment.Status.REMINDED_D1, Appointment.Status.REMINDED_D7],
        confirmed_slot__date=today,
    ).order_by("confirmed_slot")
    return Response(AppointmentSerializer(appts, many=True).data)


@extend_schema(tags=["appointments"])
@api_view(["POST"])
@permission_classes([IsNurse])
def check_in(request, appointment_id):
    appt = get_object_or_404(Appointment, id=appointment_id)
    appt.status = Appointment.Status.CHECKED_IN
    appt.processed_by = request.user
    appt.save(update_fields=["status", "processed_by"])
    return Response(AppointmentSerializer(appt).data)


@extend_schema(tags=["appointments"])
@api_view(["POST"])
@permission_classes([IsNurse])
def mark_no_show(request, appointment_id):
    appt = get_object_or_404(Appointment, id=appointment_id)
    appt.status = Appointment.Status.NO_SHOW
    appt.processed_by = request.user
    appt.save(update_fields=["status", "processed_by"])
    return Response(AppointmentSerializer(appt).data)


# ── 의사: 휴진일정 관리 ──────────────────────────────────────────────

@extend_schema(tags=["appointments"])
@api_view(["GET", "POST"])
@permission_classes([IsDoctor])
def doctor_off_days(request):
    if request.method == "GET":
        days = DoctorOffDay.objects.filter(doctor=request.user)
        return Response([{"id": str(d.id), "date": d.date, "reason": d.reason} for d in days])

    date_str = request.data.get("date")
    reason = request.data.get("reason", "")
    if not date_str:
        return error_response("date는 필수입니다", status_code=status.HTTP_400_BAD_REQUEST)

    off_day = DoctorOffDay.objects.create(doctor=request.user, date=date_str, reason=reason)
    return Response({"id": str(off_day.id), "date": off_day.date, "reason": off_day.reason},
                     status=status.HTTP_201_CREATED)


@extend_schema(tags=["appointments"])
@api_view(["DELETE"])
@permission_classes([IsDoctor])
def doctor_off_day_delete(request, off_day_id):
    deleted, _ = DoctorOffDay.objects.filter(id=off_day_id, doctor=request.user).delete()
    if not deleted:
        return error_response("찾을 수 없습니다", status_code=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["appointments"])
@api_view(["GET", "PUT"])
@permission_classes([IsDoctor])
def doctor_weekly_schedule(request):
    """
    PUT은 12칸(6요일×2기간) 전체를 한번에 upsert — 목업의 그리드 토글 방식과
    맞춰서, 클라이언트가 한 화면분 전체를 한번에 저장하게 함.
    body: [{"day_of_week": "mon", "period": "am", "available": true}, ...]
    """
    if request.method == "GET":
        rows = DoctorWeeklySchedule.objects.filter(doctor=request.user)
        return Response([
            {"day_of_week": r.day_of_week, "period": r.period, "available": r.available} for r in rows
        ])

    entries = request.data if isinstance(request.data, list) else []
    for entry in entries:
        DoctorWeeklySchedule.objects.update_or_create(
            doctor=request.user, day_of_week=entry["day_of_week"], period=entry["period"],
            defaults={"available": entry["available"]},
        )
    rows = DoctorWeeklySchedule.objects.filter(doctor=request.user)
    return Response([
        {"day_of_week": r.day_of_week, "period": r.period, "available": r.available} for r in rows
    ])


# ── 의사: 본인 예약목록 조회 ──────────────────────────────────────────

@extend_schema(tags=["appointments"], responses={200: AppointmentSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsDoctor])
def doctor_my_appointments(request):
    """
    /mine/ 은 환자 전용("내 예약")이라 의사 계정으론 항상 403이 났음 —
    의사가 본인이 진료하는 예약목록을 보려면 별도 엔드포인트가 필요했음.
    """
    appointments = Appointment.objects.filter(doctor=request.user).exclude(
        status=Appointment.Status.CANCELLED
    ).order_by("confirmed_slot")
    return Response(AppointmentSerializer(appointments, many=True).data)


@extend_schema(tags=["appointments"], responses={200: AppointmentSerializer})
@api_view(["POST"])
@permission_classes([IsDoctor])
def doctor_approve_appointment(request, appointment_id):
    with transaction.atomic():
        appointment = get_object_or_404(
            Appointment.objects.select_for_update(),
            id=appointment_id,
            doctor=request.user,
        )
        if appointment.status != Appointment.Status.REQUESTED:
            return error_response(
                "승인 대기 중인 예약만 승인할 수 있습니다.",
                status_code=status.HTTP_409_CONFLICT,
            )

        appointment.status = Appointment.Status.CONFIRMED
        appointment.confirmed_slot = appointment.requested_at_slot
        appointment.reviewed_at = timezone.now()
        appointment.save(update_fields=["status", "confirmed_slot", "reviewed_at"])

    record_audit(actor=request.user, action="appointment.approved", resource_type="appointment", resource_id=appointment.id, metadata={"patient_id": str(appointment.patient_id)})

    notify(
        recipient_id=appointment.patient_id,
        category="appointment",
        title="예약 확정",
        body=f"{appointment.department} 예약이 확정되었습니다.",
        deep_link=f"/appointments/{appointment.id}",
    )
    return Response(AppointmentSerializer(appointment).data)


@api_view(["POST"])
@permission_classes([IsDoctor])
def doctor_reject_appointment(request, appointment_id):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return error_response("반려 사유를 입력해주세요.", status_code=status.HTTP_400_BAD_REQUEST)
    appointment = get_object_or_404(Appointment, id=appointment_id, doctor=request.user, status=Appointment.Status.REQUESTED)
    appointment.status = Appointment.Status.REJECTED
    appointment.rejection_reason = reason
    appointment.reviewed_at = timezone.now()
    appointment.save(update_fields=["status", "rejection_reason", "reviewed_at"])
    record_audit(actor=request.user, action="appointment.rejected", resource_type="appointment", resource_id=appointment.id, metadata={"patient_id": str(appointment.patient_id), "reason": reason})
    notify(recipient_id=appointment.patient_id, category="appointment", title="예약 반려", body=reason, deep_link=f"/appointments/{appointment.id}")
    return Response(AppointmentSerializer(appointment).data)


@api_view(["POST"])
@permission_classes([IsDoctor])
def doctor_propose_time(request, appointment_id):
    proposed_slot = request.data.get("proposed_slot")
    reason = str(request.data.get("reason", "")).strip()
    if not proposed_slot:
        return error_response("대체 시간을 입력해주세요.", status_code=status.HTTP_400_BAD_REQUEST)
    from django.utils.dateparse import parse_datetime
    parsed_slot = parse_datetime(proposed_slot)
    if parsed_slot is not None and timezone.is_naive(parsed_slot):
        parsed_slot = timezone.make_aware(parsed_slot, timezone.get_current_timezone())
    if parsed_slot is None or parsed_slot <= timezone.now():
        return error_response("유효한 미래 시간을 입력해주세요.", status_code=status.HTTP_400_BAD_REQUEST)
    appointment = get_object_or_404(Appointment, id=appointment_id, doctor=request.user, status=Appointment.Status.REQUESTED)
    appointment.status = Appointment.Status.TIME_PROPOSED
    appointment.proposed_slot = parsed_slot
    appointment.proposal_reason = reason
    appointment.reviewed_at = timezone.now()
    appointment.save(update_fields=["status", "proposed_slot", "proposal_reason", "reviewed_at"])
    record_audit(actor=request.user, action="appointment.time_proposed", resource_type="appointment", resource_id=appointment.id, metadata={"patient_id": str(appointment.patient_id), "proposed_slot": parsed_slot.isoformat(), "reason": reason})
    notify(recipient_id=appointment.patient_id, category="appointment", title="예약 시간 변경 제안", body=reason or parsed_slot.strftime("%m월 %d일 %H:%M"), deep_link=f"/appointments/{appointment.id}")
    return Response(AppointmentSerializer(appointment).data)
