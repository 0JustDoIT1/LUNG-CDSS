import datetime

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsNurse, IsPatient

from .models import MedicationLog, MedicationSchedule
from .serializers import MedicationLogSerializer, MedicationScheduleCreateSerializer, MedicationScheduleSerializer

MAX_AUTOGEN_DAYS = 90  # end_date 미정인 처방도 무한정 로그를 만들지 않도록 상한


@extend_schema(tags=["medications"], request=MedicationScheduleCreateSerializer, responses={201: MedicationScheduleSerializer})
@api_view(["POST"])
@permission_classes([IsNurse])
def create_schedule(request):
    serializer = MedicationScheduleCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    schedule = MedicationSchedule.objects.create(set_by=request.user, **serializer.validated_data)
    _generate_logs(schedule)
    return Response(MedicationScheduleSerializer(schedule).data, status=status.HTTP_201_CREATED)


def _generate_logs(schedule):
    end_date = schedule.end_date or (schedule.start_date + datetime.timedelta(days=MAX_AUTOGEN_DAYS))
    end_date = min(end_date, schedule.start_date + datetime.timedelta(days=MAX_AUTOGEN_DAYS))

    day = schedule.start_date
    logs = []
    while day <= end_date:
        for time_str in schedule.times_per_day:
            hour, minute = map(int, time_str.split(":"))
            scheduled_time = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))
            logs.append(MedicationLog(schedule=schedule, scheduled_time=scheduled_time))
        day += datetime.timedelta(days=1)

    MedicationLog.objects.bulk_create(logs)


@extend_schema(tags=["medications"], responses={200: MedicationLogSerializer(many=True)})
@api_view(["GET"])
@permission_classes([IsPatient])
def today_logs(request):
    today = timezone.localdate()
    logs = MedicationLog.objects.filter(
        schedule__patient=request.user, scheduled_time__date=today
    ).select_related("schedule").order_by("scheduled_time")
    return Response(MedicationLogSerializer(logs, many=True).data)


@extend_schema(tags=["medications"], responses={200: MedicationLogSerializer})
@api_view(["POST"])
@permission_classes([IsPatient])
def mark_taken(request, log_id):
    try:
        log = MedicationLog.objects.select_related("schedule").get(id=log_id, schedule__patient=request.user)
    except MedicationLog.DoesNotExist:
        return Response({"error": "찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)

    taken = request.data.get("taken", True)
    log.taken = bool(taken)
    log.taken_at = timezone.now() if taken else None
    log.save(update_fields=["taken", "taken_at"])
    return Response(MedicationLogSerializer(log).data)


@extend_schema(tags=["medications"])
@api_view(["GET"])
@permission_classes([IsPatient])
def monthly_compliance(request):
    year = int(request.query_params.get("year", timezone.localdate().year))
    month = int(request.query_params.get("month", timezone.localdate().month))

    logs = MedicationLog.objects.filter(
        schedule__patient=request.user,
        scheduled_time__year=year,
        scheduled_time__month=month,
        scheduled_time__lte=timezone.now(),  # 아직 안 지난 스케줄은 통계에서 제외
    )
    total = logs.count()
    taken = logs.filter(taken=True).count()
    rate = round(taken / total * 100) if total else None

    by_day = (
        logs.values("scheduled_time__date")
        .annotate(total=Count("id"), taken=Count("id", filter=Q(taken=True)))
        .order_by("scheduled_time__date")
    )

    return Response({
        "rate": rate,
        "by_day": [
            {"date": row["scheduled_time__date"], "total": row["total"], "taken": row["taken"]}
            for row in by_day
        ],
    })


@extend_schema(tags=["medications"])
@api_view(["GET"])
@permission_classes([IsNurse])
def patient_compliance_summary(request, patient_id):
    """간호사가 담당환자 리스트에서 조회하는 순응도 요약 — 능동 알림 아님, 조회시만."""
    since = timezone.now() - datetime.timedelta(days=30)
    logs = MedicationLog.objects.filter(
        schedule__patient_id=patient_id, scheduled_time__gte=since, scheduled_time__lte=timezone.now()
    )
    total = logs.count()
    taken = logs.filter(taken=True).count()
    rate = round(taken / total * 100) if total else None
    return Response({"patient_id": patient_id, "compliance_rate_30d": rate})
