from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

from .models import IntakeForm


class PatientIntakeFormPermissionTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.form = IntakeForm.objects.create(
            patient=self.patient,
            content={"status": "draft", "questions": []},
        )
        self.url = reverse("intake-patient", args=[self.patient.id])

    def test_doctor_can_view_patient_intake_form(self):
        doctor = User.objects.create_staff(User.Role.DOCTOR, "Doctor One")
        self.client.force_authenticate(doctor)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.form.id))

    def test_patient_cannot_view_staff_intake_endpoint(self):
        self.client.force_authenticate(self.patient)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
