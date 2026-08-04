import uuid

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class SymptomCheck(models.Model):
    class RiskLevel(models.TextChoices):
        GREEN = "green", "정상"
        YELLOW = "yellow", "주의"
        RED = "red", "위험"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="symptom_checks",
                                 limit_choices_to={"role": "patient"})
    checked_at = models.DateTimeField(auto_now_add=True)
    symptoms = models.JSONField()
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)

    # RED 등급은 이 값과 무관하게 무조건 간호사/의사에게 전달됨 (앱 정책, views.py에서 강제)
    visible_to_nurse = models.BooleanField(default=True)

    nurse_reviewed = models.BooleanField(default=False)
    nurse_reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                           related_name="reviewed_symptom_checks",
                                           limit_choices_to={"role": "nurse"})
    nurse_reviewed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-checked_at"]

    def __str__(self):
        return f"{self.patient.name} · {self.checked_at:%Y-%m-%d} · {self.risk_level}"
