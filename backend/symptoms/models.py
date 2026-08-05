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
    memo = models.TextField(blank=True, default="")
    # 환자에게 제공하는 참고 정보이며 의료진 알림/검토 흐름에는 사용하지 않는다.
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)

    class Meta:
        ordering = ["-checked_at"]

    def __str__(self):
        return f"{self.patient.name} · {self.checked_at:%Y-%m-%d} · {self.risk_level}"
