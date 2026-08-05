from unittest.mock import patch

from django.test import TestCase

from accounts.models import User

from .models import Notification
from .services import notify


class NotificationDeliveryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_patient(name="Patient One")

    @patch("communication.services._send_fcm")
    def test_database_and_fcm_use_same_category_and_deep_link(self, send_fcm):
        with self.captureOnCommitCallbacks(execute=True):
            notification = notify(
                recipient_id=self.user.id,
                category="appointment",
                title="예약 확정",
                body="예약이 확정되었습니다.",
                deep_link="/appointments/test-id",
            )

        saved = Notification.objects.get(id=notification.id)
        self.assertEqual(saved.category, "appointment")
        self.assertEqual(saved.deep_link, "/appointments/test-id")
        send_fcm.assert_called_once_with(
            self.user.id,
            "appointment",
            "예약 확정",
            "예약이 확정되었습니다.",
            "/appointments/test-id",
        )

    def test_invalid_category_is_rejected(self):
        with self.assertRaises(ValueError):
            notify(
                recipient_id=self.user.id,
                category="",
                title="Invalid",
                body="Invalid",
            )
