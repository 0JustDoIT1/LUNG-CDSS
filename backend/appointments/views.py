import datetime

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import DoctorOffDay, DoctorProfile, DoctorWeeklySchedule, User
from accounts.permissions import IsNurse, IsPatient
from communication.services import notify

from .models import Appointment
from .serializers import AppointmentCreateSerializer, AppointmentSerializer

DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SLOTS_AM = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]
SLOTS_PM = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"]


@extend_schema(tags=["appointments"])
@api_view(["GET"])
@permission_classes([IsPatient])
def department_list(request):
    departments = DoctorProfile.objects.values_list("department", flat=True).distinct()
    return Response(sorted(set(departments)))


@extend_schema(tags=["appointments"])
@api_view(["GET"])
@permission_classes([IsPatient])
def doctor_list(request):
    department = request.query_params.get("department")
    if not department:
        return Response({"error": "department는 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

    profiles = DoctorProfile.objects.filter(department=department).select_related("user")
    assigned_doctor_id = getattr(getattr(request.user, "patient_profile", None), "assigned_doctor_id", None)

    data = []
    for profile in profiles:
        data.append({
            "id": str(profile.user_id),
            "name": profile.user.name,
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


@extend_schema(tags=["appointments"])
@api_view(["GET"])
@permission_classes([IsPatient])
def available_slots(request, doctor_id):
    date_str = request.query_params.get("date")
    if not date_str:
        return Response({"error": "date는 필수입니다 (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
    date = datetime.date.fromisoformat(date_str)
    return Response(_available_slots_for_date(doctor_id, date))


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
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    slot = data["requested_at_slot"]
    doctor = get_object_or_404(User, id=data["doctor_id"], role="doctor")

    available = _available_slots_for_date(doctor.id, slot.date())
    if slot.strftime("%H:%M") not in available:
        return Response({"error": "선택하신 시간은 더 이상 예약할 수 없습니다"}, status=status.HTTP_409_CONFLICT)

    appointment = Appointment.objects.create(
        patient=request.user, doctor=doctor, department=data["department"], requested_at_slot=slot,
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
        return Response({"error": "action은 approve 또는 reject여야 합니다"}, status=status.HTTP_400_BAD_REQUEST)

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
