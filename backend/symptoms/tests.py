from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

from .models import SymptomCheck


SYMPTOMS = {
    "cough": "없음",
    "dyspnea": "없음",
    "hemoptysis": "없음",
    "chest_pain": "없음",
    "fever": "없음",
    "weight_loss": "없음",
    "appetite": "평소와 같음",
    "fatigue": "없음",
}


class MySymptomChecksTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.client.force_authenticate(self.patient)
        self.url = reverse("symptom-mine")

    def test_response_contains_structured_symptoms_in_latest_first_order(self):
        older = SymptomCheck.objects.create(
            patient=self.patient,
            symptoms=SYMPTOMS,
            risk_level=SymptomCheck.RiskLevel.GREEN,
        )
        newer = SymptomCheck.objects.create(
            patient=self.patient,
            symptoms={**SYMPTOMS, "cough": "약간"},
            risk_level=SymptomCheck.RiskLevel.GREEN,
        )
        SymptomCheck.objects.filter(id=older.id).update(
            checked_at=timezone.now() - timedelta(days=1),
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.data],
            [str(newer.id), str(older.id)],
        )
        self.assertEqual(response.data[0]["symptoms"]["cough"], "약간")
        self.assertEqual(set(response.data[0]["symptoms"]), set(SYMPTOMS))

    def test_empty_history_returns_empty_array(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
