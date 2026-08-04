import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from communication.services import notify
from rag.exceptions import RAGServiceError
from rag.rag_service import generate_treatment_note

from .models import AIAnalysisResult, Case, GenePrediction, NucleiPatch
from .services import call_mosec_predict, call_mosec_thumbnail

logger = logging.getLogger(__name__)


def _notify_analysis_outcome(case, succeeded):
    """분석 알림 실패가 작업 결과 저장을 되돌리지 않게 한다."""
    try:
        if case.uploaded_by_id:
            notify(
                recipient_id=case.uploaded_by_id,
                category="case_review",
                title="AI 분석 완료" if succeeded else "AI 분석 실패",
                body=(
                    f"{case.specimen_id} 분석이 완료되었습니다. 결과를 확인해 주세요."
                    if succeeded
                    else f"{case.specimen_id} 분석에 실패했습니다. 다시 처리해 주세요."
                ),
                deep_link=f"/cases/{case.id}/result" if succeeded else f"/analysis/{case.id}",
            )

        if succeeded:
            doctor_ids = User.objects.filter(role=User.Role.DOCTOR, is_active=True).values_list("id", flat=True)
            for doctor_id in doctor_ids:
                notify(
                    recipient_id=doctor_id,
                    category="case_review",
                    title="검토 대기 케이스",
                    body=f"{case.specimen_id} AI 분석이 완료되어 의료진 검토를 기다리고 있습니다.",
                    deep_link=f"/doctor-dashboard/cases/{case.id}",
                )
    except Exception:
        logger.exception("케이스 알림 생성 실패 (case_id=%s)", case.id)


def _mark_analysis_failed(case_id, code, message):
    with transaction.atomic():
        case = Case.objects.select_for_update().get(id=case_id)
        if case.status != Case.Status.PROCESSING:
            return case
        case.status = Case.Status.FAILED
        case.analysis_error_code = code
        case.analysis_error_message = str(message)[:2000]
        case.analysis_task_id = ""
        case.last_progress_at = timezone.now()
        case.save(update_fields=[
            "status", "analysis_error_code", "analysis_error_message",
            "analysis_task_id", "last_progress_at",
        ])
    _notify_analysis_outcome(case, succeeded=False)
    return case


def _perform_case_analysis(case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return {"status": "not_found"}

    if case.status != Case.Status.PROCESSING:
        return {"status": "ignored", "case_status": case.status}

    try:
        result = call_mosec_predict(str(case.id), case.slide_gcs_path)
    except Exception as exc:
        logger.exception("AI 분석 서비스 호출 실패 (case_id=%s)", case.id)
        _mark_analysis_failed(case.id, "UPSTREAM_ERROR", exc)
        return {"status": "failed", "error_code": "UPSTREAM_ERROR"}

    if not case.slide_thumbnail_gcs_path:
        try:
            thumb_result = call_mosec_thumbnail(str(case.id), case.slide_gcs_path)
            case.slide_thumbnail_gcs_path = thumb_result["slide_thumbnail_gcs_path"]
        except Exception:
            logger.exception("썸네일 폴백 생성 실패 (case_id=%s)", case.id)

    gene_predictions = {
        gene["gene_name"]: gene["likelihood"]
        for gene in result.get("gene_predictions", [])
    }
    try:
        treatment_note = generate_treatment_note(predictions=gene_predictions)["treatment_note"]
    except RAGServiceError:
        treatment_note = None
        logger.exception("RAG 소견 생성 실패 (case_id=%s)", case.id)

    with transaction.atomic():
        case = Case.objects.select_for_update().get(id=case.id)
        # watchdog가 이미 실패 처리한 늦은 응답은 결과로 반영하지 않는다.
        if case.status != Case.Status.PROCESSING:
            return {"status": "discarded", "case_status": case.status}

        ai_result = AIAnalysisResult.objects.create(
            case=case,
            model_version=result.get("model_version", "unknown"),
            heatmap_gcs_path=result["heatmap_gcs_path"],
            nuclei_density_score=result.get("nuclei_density_score"),
            nuclei_density_level=result.get("nuclei_density_level"),
            nuclei_irregularity_score=result.get("nuclei_irregularity_score"),
            nuclei_irregularity_level=result.get("nuclei_irregularity_level"),
            prediction_label=result["prediction_label"],
            luad_probability=result["luad_probability"],
            lusc_probability=result["lusc_probability"],
            treatment_note=treatment_note,
        )

        NucleiPatch.objects.bulk_create([
            NucleiPatch(
                ai_result=ai_result,
                original_gcs_path=patch["original_gcs_path"],
                overlay_gcs_path=patch["overlay_gcs_path"],
                nuclei_count=patch.get("nuclei_count"),
                attention_rank=patch.get("attention_rank"),
            )
            for patch in result.get("nuclei_patches", [])
        ])
        GenePrediction.objects.bulk_create([
            GenePrediction(ai_result=ai_result, gene_name=name, likelihood=likelihood)
            for name, likelihood in gene_predictions.items()
        ])

        case.status = Case.Status.PENDING_REVIEW
        case.completed_at = timezone.now()
        case.last_progress_at = case.completed_at
        case.analysis_task_id = ""
        case.analysis_error_code = ""
        case.analysis_error_message = ""
        case.save(update_fields=[
            "status", "completed_at", "last_progress_at", "analysis_task_id",
            "analysis_error_code", "analysis_error_message", "slide_thumbnail_gcs_path",
        ])

    _notify_analysis_outcome(case, succeeded=True)
    return {"status": "completed", "ai_result_id": str(ai_result.id)}


@shared_task(bind=True, name="cases.tasks.run_case_analysis")
def run_case_analysis(self, case_id):
    try:
        return _perform_case_analysis(case_id)
    except Exception as exc:
        logger.exception("분석 작업 처리 실패 (case_id=%s, task_id=%s)", case_id, self.request.id)
        try:
            _mark_analysis_failed(case_id, "PROCESSING_ERROR", exc)
        except Case.DoesNotExist:
            return {"status": "not_found"}
        return {"status": "failed", "error_code": "PROCESSING_ERROR"}


@shared_task(name="cases.tasks.fail_stale_case_analyses")
def fail_stale_case_analyses(timeout_minutes=20):
    cutoff = timezone.now() - timedelta(minutes=timeout_minutes)
    stale_ids = list(
        Case.objects.filter(
            status=Case.Status.PROCESSING,
            last_progress_at__lt=cutoff,
        ).values_list("id", flat=True)
    )
    for case_id in stale_ids:
        _mark_analysis_failed(case_id, "ANALYSIS_TIMEOUT", "분석 진행 상태가 제한 시간 동안 갱신되지 않았습니다.")
    return {"failed_count": len(stale_ids)}
