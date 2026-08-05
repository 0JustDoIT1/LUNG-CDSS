from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

from .models import AIAnalysisResult, Case, ConfirmedFinding, GenePrediction


class PatientResultApiTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.other_patient = User.objects.create_patient(name="Patient Two")
        self.doctor = User.objects.create_staff(User.Role.DOCTOR, "Doctor One")

        self.case = Case.objects.create(
            patient=self.patient,
            specimen_id="SPEC-001",
            status=Case.Status.CONFIRMED,
        )
        ai_result = AIAnalysisResult.objects.create(
            case=self.case,
            model_version="test",
            prediction_label="LUAD",
            luad_probability=0.81,
            lusc_probability=0.19,
        )
        GenePrediction.objects.create(ai_result=ai_result, gene_name="TP53", likelihood=0.72)
        ConfirmedFinding.objects.create(
            case=self.case,
            based_on_result=ai_result,
            final_subtype="LUAD",
            final_note="confirmed",
            confirmed_by=self.doctor,
        )
        self.unreleased_case = Case.objects.create(
            patient=self.patient,
            specimen_id="SPEC-002",
            status=Case.Status.PENDING_REVIEW,
        )

    def test_patient_receives_probabilities_for_released_results(self):
        self.client.force_authenticate(self.patient)

        response = self.client.get(reverse("my-results"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        result = response.data[0]
        self.assertEqual(result["case_id"], str(self.case.id))
        self.assertEqual(result["luad_probability"], 0.81)
        self.assertEqual(result["lusc_probability"], 0.19)
        self.assertEqual(result["gene_predictions"], [{"gene_name": "TP53", "likelihood": 0.72}])
        self.assertTrue(result["is_released"])
        self.assertEqual(result["released_at"], result["confirmed_at"])

    def test_unreleased_result_detail_is_hidden_as_not_found(self):
        self.client.force_authenticate(self.patient)

        response = self.client.get(reverse("my-result-detail", args=[self.unreleased_case.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_patient_is_forbidden(self):
        self.client.force_authenticate(self.doctor)

        response = self.client.get(reverse("my-results"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

# Create your tests here.
