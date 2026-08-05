import uuid

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class Appointment(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "요청됨"
        CONFIRMED = "confirmed", "확정"
        REMINDED_D7 = "reminded_d7", "D-7 알림 발송"
        REMINDED_D1 = "reminded_d1", "D-1 알림 발송"
        CHECKED_IN = "checked_in", "방문완료"
        COMPLETED = "completed", "진료완료"
        CANCELLED = "cancelled", "취소"
        NO_SHOW = "no_show", "미방문"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="appointments",
                                 limit_choices_to={"role": "patient"})
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="doctor_appointments",
                                limit_choices_to={"role": "doctor"})
    department = models.CharField(max_length=50)
    requested_at_slot = models.DateTimeField()
    confirmed_slot = models.DateTimeField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    processed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name="processed_appointments",
                                      limit_choices_to={"role": "nurse"})
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["requested_at_slot"]
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "requested_at_slot"],
                condition=models.Q(status__in=["requested", "confirmed", "reminded_d7", "reminded_d1"]),
                name="uniq_active_doctor_slot",
            ),
        ]

    def __str__(self):
        return f"{self.patient.name} · {self.department} · {self.status}"
