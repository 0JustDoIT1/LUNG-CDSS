from django.db import models
from django.contrib.auth.models import User


class HospitalProfile(models.Model):
    DEPARTMENT_CHOICES = [
        ("pathology", "병리과"),
        ("pulmonology", "호흡기내과"),
        ("oncology", "종양내과"),
    ]
    ROLE_CHOICES = [
        ("doctor", "의사"),
        ("pathologist", "병리사"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="hospital_profile")
    hospital_code = models.CharField(max_length=6, unique=True)
    name = models.CharField(max_length=50)
    department = models.CharField(max_length=20, choices=DEPARTMENT_CHOICES)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.hospital_code} - {self.name} ({self.get_role_display()})"