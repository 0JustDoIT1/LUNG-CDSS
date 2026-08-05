from copy import deepcopy

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User

from .default_template import DEFAULT_QUESTIONS
from .models import IntakeForm, IntakeTemplate


class MyIntakeFormTests(APITestCase):
    def setUp(self):
        IntakeTemplate.objects.create(
            name="Test template", version=99,
            questions=deepcopy(DEFAULT_QUESTIONS), is_active=True,
        )
        self.patient = User.objects.create_patient(name="Patient One")
        self.client.force_authenticate(self.patient)
        self.url = reverse("intake-mine")

    def get_content(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["content"]

    def completed_questions(self, questions):
        completed = deepcopy(questions)
        for question in completed:
            if question["required"]:
                if question["question_type"] == "multiple_choice":
                    question["answer"] = [question["options"][0]]
                else:
                    question["answer"] = question["options"][0]
        return completed

    def test_get_creates_draft_from_active_template_in_order(self):
        content = self.get_content()
        self.assertEqual(content["status"], "draft")
        self.assertEqual(len(content["questions"]), 15)
        self.assertEqual(
            [question["question_id"] for question in content["questions"]],
            [question["question_id"] for question in DEFAULT_QUESTIONS],
        )
        self.assertEqual(content["questions"][0]["answer"], [])
        self.assertIsNone(content["questions"][1]["answer"])
        self.assertEqual(content["questions"][6]["answer"], "")

    def test_get_backfills_an_existing_empty_draft(self):
        form = IntakeForm.objects.create(
            patient=self.patient, content={"status": "draft", "questions": []},
        )
        content = self.get_content()
        form.refresh_from_db()
        self.assertEqual(len(content["questions"]), 15)
        self.assertEqual(form.content, content)

    def test_put_updates_answers_but_preserves_question_definitions(self):
        questions = deepcopy(self.get_content()["questions"])
        questions[0]["answer"] = ["기침"]
        questions[0]["question_text"] = "변조된 문구"
        questions[0]["options"] = ["변조된 선택지"]
        response = self.client.put(
            self.url, {"content": {"status": "draft", "questions": questions}}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        saved = response.data["content"]["questions"][0]
        self.assertEqual(saved["answer"], ["기침"])
        self.assertEqual(saved["question_text"], DEFAULT_QUESTIONS[0]["question_text"])
        self.assertEqual(saved["options"], DEFAULT_QUESTIONS[0]["options"])

    def test_put_rejects_changed_question_ids_or_order(self):
        questions = deepcopy(self.get_content()["questions"])
        questions.reverse()
        response = self.client.put(
            self.url, {"content": {"status": "draft", "questions": questions}}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_submits_only_when_required_answers_are_present(self):
        questions = self.completed_questions(self.get_content()["questions"])
        response = self.client.put(
            self.url, {"content": {"status": "submitted", "questions": questions}}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["content"]["status"], "submitted")
        self.assertIsNotNone(response.data["submitted_at"])

    def test_put_rejects_submission_with_missing_required_answers(self):
        content = self.get_content()
        response = self.client.put(
            self.url, {"content": {"status": "submitted", "questions": content["questions"]}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)