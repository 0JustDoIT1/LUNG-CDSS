import uuid

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class IntakeTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    version = models.PositiveIntegerField(default=1)
    questions = models.JSONField()
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-version', '-updated_at']

    def __str__(self):
        return f'{self.name} v{self.version}'


class IntakeForm(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="intake_forms",
                                 limit_choices_to={"role": "patient"})
    content = models.JSONField()  # 복용약물/알레르기/흡연력/가족력 등
    submitted_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.patient.name} intake form"
