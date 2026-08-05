from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

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
