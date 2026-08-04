import uuid

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class MedicationSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="medication_schedules",
                                 limit_choices_to={"role": "patient"})
    drug_name = models.CharField(max_length=100)
    dosage = models.CharField(max_length=50)
    times_per_day = models.JSONField()  # e.g. ["09:00", "21:00"]
    start_date = models.DateField()
    end_date = models.DateField(blank=True, null=True)
    set_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="set_medication_schedules",
                                limit_choices_to={"role": "nurse"})

    def __str__(self):
        return f"{self.patient.name} · {self.drug_name} {self.dosage}"


class MedicationLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    schedule = models.ForeignKey(MedicationSchedule, on_delete=models.CASCADE, related_name="logs")
    scheduled_time = models.DateTimeField()
    taken = models.BooleanField(default=False)
    taken_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["scheduled_time"]

    def __str__(self):
        return f"{self.schedule.drug_name} @ {self.scheduled_time:%Y-%m-%d %H:%M} ({'복용' if self.taken else '대기'})"
