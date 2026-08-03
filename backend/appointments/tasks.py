from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from communication.services import notify

from .models import Appointment


@shared_task
def send_appointment_reminders():
    now = timezone.now()

    d7_targets = Appointment.objects.filter(
        status=Appointment.Status.CONFIRMED,
        confirmed_slot__date=(now + timedelta(days=7)).date(),
    )
    for appt in d7_targets:
        _send_reminder(appt, "d7")
        appt.status = Appointment.Status.REMINDED_D7
        appt.save(update_fields=["status"])

    d1_targets = Appointment.objects.filter(
        status__in=[Appointment.Status.CONFIRMED, Appointment.Status.REMINDED_D7],
        confirmed_slot__date=(now + timedelta(days=1)).date(),
    )
    for appt in d1_targets:
        _send_reminder(appt, "d1")
        appt.status = Appointment.Status.REMINDED_D1
        appt.save(update_fields=["status"])


def _send_reminder(appointment, kind):
    label = "7일 전" if kind == "d7" else "내일"
    notify(
        recipient_id=appointment.patient_id,
        category="appointment",
        title=f"예약 {label} 알림",
        body=f"{appointment.confirmed_slot.strftime('%m월 %d일 %H:%M')} {appointment.department} 예약이 있습니다.",
        deep_link=f"/appointments/{appointment.id}",
    )
