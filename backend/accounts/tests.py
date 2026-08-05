from datetime import date

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Hospital, PatientProfile, User


class PatientRegisterGenderTests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Registration Hospital")
        self.signup_token = "gender-signup-token"
        cache.set(
            f"signup_session:{self.signup_token}",
            {"provider": "google", "social_uid": "gender-user", "name": "Patient Gender"},
            timeout=300,
        )

    def test_register_saves_and_returns_gender(self):
        response = self.client.post(
            reverse("patient-register"),
            {
                "signup_token": self.signup_token,
                "birth_date": "1990-01-01",
                "hospital_id": str(self.hospital.id),
                "phone_number": "010-1234-5678",
                "gender": "female",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["gender"], "female")
        self.assertEqual(PatientProfile.objects.get(user__name="Patient Gender").gender, "female")

    def test_register_allows_omitted_gender_for_existing_client_compatibility(self):
        response = self.client.post(
            reverse("patient-register"),
            {
                "signup_token": self.signup_token,
                "birth_date": "1990-01-01",
                "hospital_id": str(self.hospital.id),
                "phone_number": "010-1234-5678",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["gender"])
        self.assertIsNone(PatientProfile.objects.get(user__name="Patient Gender").gender)


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
