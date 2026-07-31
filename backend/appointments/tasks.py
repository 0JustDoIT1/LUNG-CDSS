from datetime import timedelta

from celery import shared_task
from django.utils import timezone

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
    # TODO: communication.services.send_fcm 연동 (FCM 발송 로직 완성 시 교체)
    print(f"[appointment-reminder:{kind}] {appointment.patient.name} · {appointment.confirmed_slot}")
