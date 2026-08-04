from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User

from .models import Case
from .tasks import fail_stale_case_analyses, run_case_analysis


class AnalysisQueueApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.pathologist = User.objects.create_staff(User.Role.PATHOLOGIST, "병리사")
        self.patient = User.objects.create_patient("환자")
        self.case = Case.objects.create(
            patient=self.patient,
            uploaded_by=self.pathologist,
            specimen_id="ASYNC-001",
            slide_gcs_path="gs://bucket/slide.svs",
        )
        self.client.force_authenticate(self.pathologist)

    @patch("cases.views.run_case_analysis.delay", return_value=SimpleNamespace(id="task-123"))
    def test_predict_queues_task_and_returns_202(self, delay_mock):
        response = self.client.post(reverse("predict-case", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status, Case.Status.PROCESSING)
        self.assertEqual(self.case.analysis_task_id, "task-123")
        self.assertIsNotNone(self.case.last_progress_at)
        delay_mock.assert_called_once_with(str(self.case.id))

    @patch("cases.views.run_case_analysis.delay", return_value=SimpleNamespace(id="retry-123"))
    def test_failed_case_can_be_retried(self, _delay_mock):
        self.case.status = Case.Status.FAILED
        self.case.analysis_error_code = "UPSTREAM_ERROR"
        self.case.analysis_error_message = "timeout"
        self.case.save(update_fields=["status", "analysis_error_code", "analysis_error_message"])

        response = self.client.post(reverse("retry-case-analysis", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.case.refresh_from_db()
        self.assertEqual(self.case.retry_count, 1)
        self.assertEqual(self.case.analysis_error_message, "")

    @patch("cases.views.run_case_analysis.delay", side_effect=RuntimeError("redis unavailable"))
    def test_queue_failure_is_recorded(self, _delay_mock):
        response = self.client.post(reverse("predict-case", args=[self.case.id]))

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status, Case.Status.FAILED)
        self.assertEqual(self.case.analysis_error_code, "QUEUE_UNAVAILABLE")

    @patch("cases.views.INTERNAL_CALLBACK_TOKEN", "internal-test-token")
    def test_progress_callback_updates_heartbeat(self):
        self.case.status = Case.Status.PROCESSING
        self.case.current_step = Case.Step.UPLOADED
        self.case.last_progress_at = timezone.now() - timedelta(minutes=2)
        self.case.save(update_fields=["status", "current_step", "last_progress_at"])
        previous = self.case.last_progress_at

        response = self.client.post(
            reverse("update-case-step", args=[self.case.id]),
            {"step": Case.Step.PREPROCESSING},
            format="json",
            HTTP_X_INTERNAL_TOKEN="internal-test-token",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.current_step, Case.Step.PREPROCESSING)
        self.assertGreater(self.case.last_progress_at, previous)


class AnalysisTaskTests(TestCase):
    def setUp(self):
        self.patient = User.objects.create_patient("환자")
        self.case = Case.objects.create(
            patient=self.patient,
            specimen_id="TASK-001",
            slide_gcs_path="gs://bucket/slide.svs",
            slide_thumbnail_gcs_path="gs://bucket/original.png",
            status=Case.Status.PROCESSING,
            analyzed_at=timezone.now(),
            last_progress_at=timezone.now(),
        )

    @patch("cases.tasks._notify_analysis_outcome")
    @patch("cases.tasks.generate_treatment_note", return_value={"treatment_note": "치료 소견"})
    @patch("cases.tasks.call_mosec_predict")
    def test_worker_persists_result(self, predict_mock, _rag_mock, _notify_mock):
        predict_mock.return_value = {
            "model_version": "v1",
            "heatmap_gcs_path": "gs://bucket/heatmap.png",
            "prediction_label": "LUAD",
            "luad_probability": 0.9,
            "lusc_probability": 0.1,
            "nuclei_patches": [],
            "gene_predictions": [{"gene_name": "KRAS", "likelihood": 0.7}],
        }

        result = run_case_analysis.run(str(self.case.id))

        self.assertEqual(result["status"], "completed")
        self.case.refresh_from_db()
        self.assertEqual(self.case.status, Case.Status.PENDING_REVIEW)
        self.assertEqual(self.case.ai_results.count(), 1)
        self.assertEqual(self.case.ai_results.first().gene_predictions.count(), 1)

    @patch("cases.tasks._notify_analysis_outcome")
    def test_stale_processing_case_is_failed(self, _notify_mock):
        self.case.last_progress_at = timezone.now() - timedelta(minutes=21)
        self.case.save(update_fields=["last_progress_at"])

        result = fail_stale_case_analyses.run(timeout_minutes=20)

        self.assertEqual(result["failed_count"], 1)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status, Case.Status.FAILED)
        self.assertEqual(self.case.analysis_error_code, "ANALYSIS_TIMEOUT")
