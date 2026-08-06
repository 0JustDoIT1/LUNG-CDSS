from datetime import date
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import DeviceToken, DoctorProfile, Hospital, NotificationPreference, PatientProfile, User


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


class PatientProfileUpdateTests(APITestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Profile Hospital")
        self.patient = User.objects.create_patient(name="Old Name")
        self.profile = PatientProfile.objects.create(
            user=self.patient,
            patient_number="PROFILE1",
            birth_date=date(1990, 1, 1),
            hospital=hospital,
        )
        self.url = reverse("patient-profile")

    def test_patch_updates_only_supplied_editable_fields(self):
        self.client.force_authenticate(self.patient)

        response = self.client.patch(
            self.url,
            {"name": "New Name", "gender": "male"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "New Name")
        self.assertEqual(response.data["gender"], "male")
        self.assertEqual(response.data["birth_date"], "1990-01-01")

    def test_missing_patient_profile_returns_not_found(self):
        patient_without_profile = User.objects.create_patient(name="No Profile")
        self.client.force_authenticate(patient_without_profile)

        response = self.client.patch(self.url, {"gender": "female"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_patient_is_forbidden(self):
        doctor = User.objects.create_staff(User.Role.DOCTOR, "Doctor One")
        self.client.force_authenticate(doctor)

        response = self.client.patch(self.url, {"gender": "female"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class DeviceTokenApiTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.client.force_authenticate(self.patient)
        self.url = reverse("device-token-register")

    def _payload(self, **overrides):
        payload = {
            "fcm_token": "fcm-token-one",
            "platform": "android",
            "app_type": "patient_app",
            "device_id": "device-one",
            "device_name": "Pixel",
        }
        payload.update(overrides)
        return payload

    def test_register_and_refresh_token_for_same_device(self):
        created = self.client.post(self.url, self._payload(), format="json")
        updated = self.client.post(
            self.url,
            self._payload(fcm_token="fcm-token-two"),
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(DeviceToken.objects.count(), 1)
        self.assertEqual(DeviceToken.objects.get().fcm_token, "fcm-token-two")

    def test_multiple_devices_are_supported(self):
        self.client.post(self.url, self._payload(), format="json")
        self.client.post(
            self.url,
            self._payload(
                fcm_token="fcm-token-two",
                device_id="device-two",
                device_name="Tablet",
            ),
            format="json",
        )

        self.assertEqual(DeviceToken.objects.filter(user=self.patient).count(), 2)

    def test_delete_unregisters_only_current_device(self):
        self.client.post(self.url, self._payload(), format="json")

        response = self.client.delete(
            reverse("device-token-unregister", args=["device-one"]) + "?app_type=patient_app",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DeviceToken.objects.filter(user=self.patient).exists())


class NotificationPreferenceApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_patient(name="Notification Patient")
        self.client.force_authenticate(self.user)
        self.list_url = reverse("notification-pref-list")
        self.update_url = reverse("notification-pref-update")

    def test_get_returns_all_and_each_category_with_default_true(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["category"] for item in response.data],
            ["all", "medication", "appointment", "chat", "triage", "case_review"],
        )
        self.assertTrue(all(item["enabled"] for item in response.data))

    def test_patch_updates_one_category(self):
        response = self.client.patch(
            self.update_url,
            {"category": "chat", "enabled": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"category": "chat", "enabled": False})
        self.assertFalse(NotificationPreference.objects.get(user=self.user, category="chat").enabled)

    def test_patch_all_updates_every_category(self):
        response = self.client.patch(
            self.update_url,
            {"category": "all", "enabled": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(NotificationPreference.objects.filter(user=self.user, enabled=False).count(), 5)

class DoctorProfilePhotoUploadTests(APITestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Photo Hospital")
        self.doctor = User.objects.create_staff(User.Role.DOCTOR, "Photo Doctor")
        DoctorProfile.objects.create(
            user=self.doctor,
            license_number="123456",
            department="Oncology",
            hospital=hospital,
        )
        self.url = reverse("doctor-profile-photo")

    @patch("accounts.views.upload_doctor_profile_photo")
    def test_doctor_can_upload_profile_photo(self, upload_mock):
        upload_mock.return_value = "https://storage.googleapis.com/test/doctor.jpg"
        self.client.force_authenticate(self.doctor)
        photo = SimpleUploadedFile("doctor.jpg", b"image-content", content_type="image/jpeg")

        response = self.client.post(self.url, {"photo": photo}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["photo_url"], upload_mock.return_value)
        upload_mock.assert_called_once()

    def test_missing_photo_is_rejected(self):
        self.client.force_authenticate(self.doctor)

        response = self.client.post(self.url, {}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_doctor_is_forbidden(self):
        patient = User.objects.create_patient(name="Patient")
        self.client.force_authenticate(patient)
        photo = SimpleUploadedFile("photo.jpg", b"image-content", content_type="image/jpeg")

        response = self.client.post(self.url, {"photo": photo}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

class HospitalInfoApiTests(APITestCase):
    def test_anonymous_user_can_get_hospital_info(self):
        hospital = Hospital.objects.create(name="Public Hospital")

        response = self.client.get(reverse("hospital-info"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(hospital.id))
        self.assertEqual(response.data["name"], hospital.name)

# Create your tests here.
