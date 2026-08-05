from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Hospital, PatientProfile, User


class StaffPatientListPermissionTests(APITestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Test Hospital")
        self.patient = User.objects.create_patient(name="Patient One")
        PatientProfile.objects.create(
            user=self.patient,
            patient_number="PATIENT1",
            birth_date=date(1990, 1, 1),
            hospital=hospital,
        )
        self.url = reverse("staff-patient-list")

    def test_pathologist_can_list_patients_for_slide_upload(self):
        pathologist = User.objects.create_staff(
            role=User.Role.PATHOLOGIST,
            name="Pathologist One",
        )
        self.client.force_authenticate(pathologist)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["id"], str(self.patient.id))

    def test_patient_cannot_list_other_patients(self):
        self.client.force_authenticate(self.patient)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

# Create your tests here.
