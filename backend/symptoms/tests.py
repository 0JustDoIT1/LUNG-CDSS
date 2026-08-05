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

    def test_only_current_patients_records_are_returned(self):
        other_patient = User.objects.create_patient(name="Patient Two")
        SymptomCheck.objects.create(
            patient=other_patient,
            symptoms=SYMPTOMS,
            memo="다른 환자 메모",
            risk_level=SymptomCheck.RiskLevel.GREEN,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])


class SubmitSymptomCheckTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.url = reverse("symptom-submit")

    def test_saves_private_record_with_memo_and_patient_reference_risk(self):
        self.client.force_authenticate(self.patient)

        response = self.client.post(
            self.url,
            {**SYMPTOMS, "memo": "저녁부터 기침이 조금 늘었습니다."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["memo"], "저녁부터 기침이 조금 늘었습니다.")
        self.assertEqual(response.data["risk_level"], SymptomCheck.RiskLevel.GREEN)
        self.assertNotIn("memo", response.data["symptoms"])
        self.assertNotIn("nurse_reviewed", response.data)
        self.assertNotIn("visible_to_nurse", response.data)
        check = SymptomCheck.objects.get()
        self.assertEqual(check.patient, self.patient)

    def test_invalid_post_returns_400_with_common_validation_error_shape(self):
        self.client.force_authenticate(self.patient)

        response = self.client.post(self.url, {**SYMPTOMS, "cough": "invalid"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(response.data["error"]["message"], "입력값을 확인해주세요")
        self.assertIn("cough", response.data["error"]["details"])

    def test_second_post_on_same_day_returns_409_conflict(self):
        self.client.force_authenticate(self.patient)
        self.client.post(self.url, SYMPTOMS, format="json")

        response = self.client.post(self.url, SYMPTOMS, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["error"]["code"], "CONFLICT")

    def test_staff_cannot_submit_or_read_patient_records(self):
        nurse = User.objects.create_staff(User.Role.NURSE, "Nurse One")
        self.client.force_authenticate(nurse)

        submit_response = self.client.post(self.url, SYMPTOMS, format="json")
        mine_response = self.client.get(reverse("symptom-mine"))

        self.assertEqual(submit_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(mine_response.status_code, status.HTTP_403_FORBIDDEN)
