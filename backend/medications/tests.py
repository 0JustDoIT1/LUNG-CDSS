from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

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
