from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Hospital, NurseProfile, PatientProfile, User

from .models import MedicationLog, MedicationSchedule
from .tasks import send_due_medication_reminders


class MedicationReminderTaskTests(TestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.nurse = User.objects.create_staff(User.Role.NURSE, "Nurse One")
        self.schedule = MedicationSchedule.objects.create(
            patient=self.patient,
            drug_name="Test Drug",
            dosage="1 tablet",
            times_per_day=["09:00"],
            start_date=timezone.localdate(),
            set_by=self.nurse,
        )

    @patch("medications.tasks.notify")
    def test_due_reminder_is_sent_only_once(self, notify_mock):
        log = MedicationLog.objects.create(
            schedule=self.schedule,
            scheduled_time=timezone.now() - timedelta(minutes=1),
        )

        send_due_medication_reminders()
        send_due_medication_reminders()

        notify_mock.assert_called_once()
        log.refresh_from_db()
        self.assertIsNotNone(log.reminder_sent_at)


class MedicationScheduleCreateApiTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Schedule Patient")
        self.nurse = User.objects.create_staff(User.Role.NURSE, "Schedule Nurse")
        self.client.force_authenticate(self.nurse)
        self.url = reverse("medication-schedule-create")

    def test_rejects_integer_times_per_day_with_400(self):
        response = self.client.post(
            self.url,
            {
                "patient": str(self.patient.id),
                "drug_name": "Salbutamol",
                "dosage": "1 tablet",
                "times_per_day": 2,
                "start_date": timezone.localdate().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("times_per_day", response.data["error"]["details"])
        self.assertFalse(MedicationSchedule.objects.filter(patient=self.patient).exists())

    def test_accepts_hhmm_time_list_and_generates_logs(self):
        response = self.client.post(
            self.url,
            {
                "patient": str(self.patient.id),
                "drug_name": "Salbutamol",
                "dosage": "1 tablet",
                "times_per_day": ["18:00", "09:00"],
                "start_date": timezone.localdate().isoformat(),
                "end_date": timezone.localdate().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["times_per_day"], ["09:00", "18:00"])
        self.assertEqual(MedicationLog.objects.filter(schedule_id=response.data["id"]).count(), 2)


class MonthlyComplianceApiTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient Monthly")
        nurse = User.objects.create_staff(User.Role.NURSE, "Nurse Monthly")
        self.schedule = MedicationSchedule.objects.create(
            patient=self.patient,
            drug_name="Monthly Drug",
            dosage="1 tablet",
            times_per_day=["09:00"],
            start_date=timezone.localdate(),
            set_by=nurse,
        )
        self.client.force_authenticate(self.patient)
        self.url = reverse("medication-compliance-monthly")

    def test_monthly_response_contains_totals_and_daily_data(self):
        now = timezone.now()
        MedicationLog.objects.create(
            schedule=self.schedule,
            scheduled_time=now - timedelta(hours=2),
            taken=True,
            taken_at=now - timedelta(hours=1),
        )
        MedicationLog.objects.create(
            schedule=self.schedule,
            scheduled_time=now - timedelta(hours=1),
            taken=False,
        )
        MedicationLog.objects.create(
            schedule=self.schedule,
            scheduled_time=now + timedelta(hours=1),
            taken=False,
        )

        response = self.client.get(self.url, {"month": timezone.localdate().strftime("%Y-%m")})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["timezone"], "Asia/Seoul")
        self.assertEqual(response.data["scheduled_count"], 2)
        self.assertEqual(response.data["taken_count"], 1)
        self.assertEqual(response.data["missed_count"], 1)
        self.assertEqual(response.data["compliance_rate"], 50)
        self.assertEqual(len(response.data["daily"]), 1)

    def test_empty_month_returns_zero_counts_and_null_rate(self):
        response = self.client.get(self.url, {"month": "2000-01"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["scheduled_count"], 0)
        self.assertEqual(response.data["taken_count"], 0)
        self.assertEqual(response.data["missed_count"], 0)
        self.assertIsNone(response.data["compliance_rate"])
        self.assertEqual(response.data["daily"], [])


class NurseMedicationApiTests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Medication Hospital")
        self.other_hospital = Hospital.objects.create(name="Other Hospital")
        self.nurse = User.objects.create_staff(User.Role.NURSE, "Nurse")
        NurseProfile.objects.create(
            user=self.nurse,
            department="Oncology",
            hospital=self.hospital,
        )
        self.patient = User.objects.create_patient(name="Patient")
        PatientProfile.objects.create(
            user=self.patient,
            patient_number="MEDPAT01",
            birth_date=timezone.localdate().replace(year=1990),
            hospital=self.hospital,
        )
        self.other_patient = User.objects.create_patient(name="Other Patient")
        PatientProfile.objects.create(
            user=self.other_patient,
            patient_number="MEDPAT02",
            birth_date=timezone.localdate().replace(year=1991),
            hospital=self.other_hospital,
        )
        self.schedule = MedicationSchedule.objects.create(
            patient=self.patient,
            drug_name="Drug A",
            dosage="1 tablet",
            times_per_day=["09:00", "18:00"],
            start_date=timezone.localdate(),
            set_by=self.nurse,
        )
        now = timezone.localtime()
        MedicationLog.objects.create(
            schedule=self.schedule,
            scheduled_time=now.replace(hour=9, minute=0, second=0, microsecond=0),
            taken=True,
            taken_at=now,
        )
        MedicationLog.objects.create(
            schedule=self.schedule,
            scheduled_time=now.replace(hour=18, minute=0, second=0, microsecond=0),
        )
        self.client.force_authenticate(self.nurse)

    def test_nurse_can_get_same_hospital_patients_today_logs(self):
        response = self.client.get(
            reverse("medication-logs-today"),
            {"patient_id": str(self.patient.id)},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["drug_name"], "Drug A")
        self.assertTrue(response.data[0]["taken"])
        self.assertFalse(response.data[1]["taken"])

    def test_nurse_cannot_get_other_hospital_patients_logs(self):
        response = self.client.get(
            reverse("medication-logs-today"),
            {"patient_id": str(self.other_patient.id)},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("medications.views.notify")
    def test_nurse_can_send_medication_reminder(self, notify_mock):
        notify_mock.return_value = None

        response = self.client.post(
            reverse("medication-reminder-send"),
            {"patient_id": str(self.patient.id), "message": "약 드세요"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        notify_mock.assert_called_once_with(
            recipient_id=self.patient.id,
            category="medication",
            title="복약 알림",
            body="약 드세요",
            deep_link="/medications",
        )

    @patch("medications.views.notify")
    def test_nurse_cannot_remind_other_hospital_patient(self, notify_mock):
        response = self.client.post(
            reverse("medication-reminder-send"),
            {"patient_id": str(self.other_patient.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        notify_mock.assert_not_called()
