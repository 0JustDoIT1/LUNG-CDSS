from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User


QUESTION = {
    "question_id": "smoking_status",
    "question_text": "현재 흡연 상태를 선택해주세요.",
    "question_type": "single_choice",
    "options": ["비흡연", "과거 흡연", "현재 흡연"],
    "required": True,
}


class MyIntakeFormTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient One")
        self.client.force_authenticate(self.patient)
        self.url = reverse("intake-mine")

    def test_get_creates_empty_draft(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["content"], {"status": "draft", "questions": []})
        self.assertIsNone(response.data["submitted_at"])

    def test_put_saves_draft_without_requiring_answers(self):
        response = self.client.put(
            self.url,
            {"content": {"status": "draft", "questions": [QUESTION]}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["content"]["questions"][0]["answer"])
        self.assertIsNone(response.data["submitted_at"])

    def test_put_submits_completed_form(self):
        response = self.client.put(
            self.url,
            {
                "content": {
                    "status": "submitted",
                    "questions": [{**QUESTION, "answer": "비흡연"}],
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["content"]["status"], "submitted")
        self.assertIsNotNone(response.data["submitted_at"])

    def test_final_submission_rejects_missing_required_answer(self):
        response = self.client.put(
            self.url,
            {"content": {"status": "submitted", "questions": [QUESTION]}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
