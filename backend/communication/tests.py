from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

from .models import ChatThread, ChatThreadParticipant, Message, Notification
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
                title="Appointment confirmed",
                body="Your appointment has been confirmed.",
                deep_link="/appointments/test-id",
            )

        saved = Notification.objects.get(id=notification.id)
        self.assertEqual(saved.category, "appointment")
        self.assertEqual(saved.deep_link, "/appointments/test-id")
        send_fcm.assert_called_once_with(
            self.user.id,
            "appointment",
            "Appointment confirmed",
            "Your appointment has been confirmed.",
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


class ChatThreadListTests(APITestCase):
    def setUp(self):
        self.doctor = User.objects.create_staff(role=User.Role.DOCTOR, name="Doctor")
        self.nurse = User.objects.create_staff(role=User.Role.NURSE, name="Nurse")
        self.thread = ChatThread.objects.create()
        ChatThreadParticipant.objects.create(thread=self.thread, user=self.doctor)
        ChatThreadParticipant.objects.create(thread=self.thread, user=self.nurse)
        self.client.force_authenticate(self.doctor)

    def test_thread_list_returns_latest_message_and_unread_count(self):
        Message.objects.create(thread=self.thread, sender=self.nurse, content="first")
        latest = Message.objects.create(thread=self.thread, sender=self.nurse, content="latest")

        response = self.client.get(reverse("thread-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["last_message"], "latest")
        self.assertEqual(response.data[0]["last_message_at"], latest.created_at)
        self.assertEqual(response.data[0]["unread_count"], 2)

    def test_opening_messages_marks_thread_read(self):
        Message.objects.create(thread=self.thread, sender=self.nurse, content="unread")

        response = self.client.get(reverse("thread-messages", args=[self.thread.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.client.get(reverse("thread-list"))
        self.assertEqual(response.data[0]["unread_count"], 0)

        Message.objects.create(thread=self.thread, sender=self.nurse, content="new")
        response = self.client.get(reverse("thread-list"))
        self.assertEqual(response.data[0]["unread_count"], 1)
