from datetime import date

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Hospital, PatientProfile, User
from communication.models import Notification

from .models import AIAnalysisResult, Case, ConfirmedFinding


class PatientResultReleaseTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient("환자")
        self.other_patient = User.objects.create_patient("다른 환자")
        self.doctor = User.objects.create_staff(User.Role.DOCTOR, "담당 의사")
        self.unrelated_doctor = User.objects.create_staff(User.Role.DOCTOR, "무관한 의사")
        self.assigned_doctor = User.objects.create_staff(User.Role.DOCTOR, "환자 담당 의사")
        self.case = Case.objects.create(
            patient=self.patient,
            specimen_id="SPEC-001",
            status=Case.Status.CONFIRMED,
        )
        self.ai_result = AIAnalysisResult.objects.create(
            case=self.case,
            model_version="test-v1",
            prediction_label=AIAnalysisResult.Label.LUAD,
            luad_probability=0.91,
            lusc_probability=0.09,
            treatment_note="AI 내부 초안",
        )
        self.finding = ConfirmedFinding.objects.create(
            case=self.case,
            based_on_result=self.ai_result,
            final_subtype="LUAD",
            final_note="의사가 확정한 환자 안내문",
            confirmed_by=self.doctor,
        )

    def test_patient_cannot_read_result_before_release(self):
        self.client.force_authenticate(self.patient)

        response = self.client.get(reverse("case-detail", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_doctor_releases_result_and_patient_receives_notification(self):
        self.client.force_authenticate(self.doctor)

        response = self.client.post(reverse("release-case", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.finding.refresh_from_db()
        self.assertIsNotNone(self.finding.released_at)
        self.assertEqual(self.finding.released_by, self.doctor)
        self.assertTrue(
            Notification.objects.filter(recipient=self.patient, title="검사 결과가 도착했습니다").exists()
        )

    def test_release_is_idempotency_guarded(self):
        self.finding.released_by = self.doctor
        self.finding.released_at = timezone.now()
        self.finding.save(update_fields=["released_by", "released_at"])
        self.client.force_authenticate(self.doctor)

        response = self.client.post(reverse("release-case", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_unrelated_doctor_cannot_release_result(self):
        self.client.force_authenticate(self.unrelated_doctor)

        response = self.client.post(reverse("release-case", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.finding.refresh_from_db()
        self.assertIsNone(self.finding.released_at)

    def test_assigned_doctor_can_release_result(self):
        hospital = Hospital.objects.create(name="테스트 병원")
        PatientProfile.objects.create(
            user=self.patient,
            birth_date=date(1990, 1, 1),
            hospital=hospital,
            assigned_doctor=self.assigned_doctor,
        )
        self.client.force_authenticate(self.assigned_doctor)

        response = self.client.post(reverse("release-case", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.finding.refresh_from_db()
        self.assertEqual(self.finding.released_by, self.assigned_doctor)

    def test_patient_only_sees_own_released_final_result(self):
        self.finding.released_by = self.doctor
        self.finding.released_at = timezone.now()
        self.finding.save(update_fields=["released_by", "released_at"])
        self.client.force_authenticate(self.patient)

        response = self.client.get(reverse("patient-result-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        result = response.data[0]
        self.assertEqual(result["final_subtype"], "LUAD")
        self.assertEqual(result["final_note"], "의사가 확정한 환자 안내문")
        self.assertNotIn("luad_probability", result)
        self.assertNotIn("latest_ai_result", result)

    def test_other_patient_cannot_read_released_result(self):
        self.finding.released_by = self.doctor
        self.finding.released_at = timezone.now()
        self.finding.save(update_fields=["released_by", "released_at"])
        self.client.force_authenticate(self.other_patient)

        response = self.client.get(reverse("case-detail", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
