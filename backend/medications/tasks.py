from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from communication.services import notify

from .models import MedicationLog


@shared_task
def send_due_medication_reminders():
    now = timezone.now()
    due_logs = MedicationLog.objects.filter(
        taken=False,
        reminder_sent_at__isnull=True,
        scheduled_time__lte=now,
        scheduled_time__gt=now - timedelta(minutes=5),
    ).select_related("schedule")

    for log in due_logs:
        notify(
            recipient_id=log.schedule.patient_id,
            category="medication",
            title="복약 시간입니다",
            body=f"{log.schedule.drug_name} {log.schedule.dosage}을(를) 복용해주세요.",
            deep_link=f"/medications/logs/{log.id}",
        )
        log.reminder_sent_at = now
        log.save(update_fields=["reminder_sent_at"])


@shared_task
def check_medication_compliance():
    """
    스케줄 시간이 2시간 이상 지났는데 taken=False인 로그를 찾아 환자 본인에게만
    강조 알림을 보낸다. 간호사 앱으로 전달되는 로직은 의도적으로 없음 —
    간호사는 필요시 담당환자 목록에서 순응도%를 직접 조회할 뿐, 능동 알림은 안 감.
    """
    threshold = timezone.now() - timedelta(hours=2)
    overdue = MedicationLog.objects.filter(taken=False, scheduled_time__lte=threshold)

    for log in overdue:
        _notify_patient(log)


def _notify_patient(log):
    notify(
        recipient_id=log.schedule.patient_id,
        category="medication",
        title="복약 확인이 필요합니다",
        body=f"{log.schedule.drug_name} {log.schedule.dosage} 복용을 확인해주세요.",
        deep_link=f"/medications/logs/{log.id}",
    )
