from unittest.mock import patch

from django.test import TestCase

from accounts.models import DeviceToken, User

from .services import notify


class FCMNotificationPayloadTests(TestCase):
    def setUp(self):
        self.patient = User.objects.create_patient("환자")
        DeviceToken.objects.create(
            user=self.patient,
            fcm_token="test-fcm-token",
            app_type=DeviceToken.AppType.PATIENT_APP,
            platform=DeviceToken.Platform.ANDROID,
        )

    @patch("firebase_admin.messaging.send")
    @patch("communication.firebase.get_firebase_app", return_value=object())
    def test_category_and_deep_link_are_in_fcm_data(self, _firebase_app, send_mock):
        notify(
            recipient_id=self.patient.id,
            category="case_review",
            title="검사 결과가 도착했습니다",
            body="검사 결과를 확인해 주세요.",
            deep_link="/results/case-id",
        )

        message = send_mock.call_args.args[0]
        self.assertEqual(message.data["category"], "case_review")
        self.assertEqual(message.data["deep_link"], "/results/case-id")
