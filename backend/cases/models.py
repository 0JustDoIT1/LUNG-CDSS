import uuid

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class Case(models.Model):
    """
    Just the pipeline/status shell. AI output lives in AIAnalysisResult,
    the doctor's final call lives in ConfirmedFinding — this table itself
    holds no diagnostic content, only where the case is in the pipeline.
    """

    class Status(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        PROCESSING = "processing", "Processing"
        PENDING_REVIEW = "pending_review", "Pending review"
        CONFIRMED = "confirmed", "Confirmed"
        FAILED = "failed", "Failed"

    class Step(models.TextChoices):
        UPLOADED = "uploaded", "업로드 확인"
        PREPROCESSING = "preprocessing", "전처리"
        FEATURE_EXTRACTION = "feature_extraction", "특징 추출"
        NUCLEI_DETECTION = "nuclei_detection", "핵 검출"
        CLASSIFICATION = "classification", "분류"
        GENERATING_RESULT = "generating_result", "결과 생성"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="cases",
                                 limit_choices_to={"role": "patient"})
    # 병리사가 React 웹에서 업로드. Flutter 앱 쪽에서는 이미 존재하는 케이스로만 다룸.
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name="uploaded_cases",
                                     limit_choices_to={"role": "pathologist"})
    specimen_id = models.CharField(max_length=100, unique=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADED)
    current_step = models.CharField(max_length=30, choices=Step.choices, blank=True, null=True)

    slide_gcs_path = models.TextField(blank=True, null=True)
    slide_thumbnail_gcs_path = models.TextField(blank=True, null=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    analyzed_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    analysis_task_id = models.CharField(max_length=255, blank=True)
    analysis_error_code = models.CharField(max_length=50, blank=True)
    analysis_error_message = models.TextField(blank=True)
    last_progress_at = models.DateTimeField(blank=True, null=True)
    retry_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.specimen_id} ({self.status})"


class AIAnalysisResult(models.Model):
    """
    Immutable AI output. Never edited after creation — a doctor
    disagreeing with this produces a new ConfirmedFinding, not a change
    here. Kept 1:N off Case so re-runs / model upgrades don't destroy
    history.
    """

    class Label(models.TextChoices):
        LUAD = "LUAD", "LUAD"
        LUSC = "LUSC", "LUSC"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="ai_results")
    model_version = models.CharField(max_length=50)

    heatmap_gcs_path = models.TextField(blank=True, null=True)

    nuclei_density_score = models.FloatField(blank=True, null=True)
    nuclei_density_level = models.CharField(max_length=20, blank=True, null=True)
    nuclei_irregularity_score = models.FloatField(blank=True, null=True)
    nuclei_irregularity_level = models.CharField(max_length=20, blank=True, null=True)

    prediction_label = models.CharField(max_length=10, choices=Label.choices, blank=True, null=True)
    luad_probability = models.FloatField(blank=True, null=True)
    lusc_probability = models.FloatField(blank=True, null=True)

    treatment_note = models.TextField(blank=True, null=True)  # MedGemma RAG 초안
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.case.specimen_id} · {self.model_version}"


class NucleiPatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ai_result = models.ForeignKey(AIAnalysisResult, on_delete=models.CASCADE, related_name="nuclei_patches")
    original_gcs_path = models.TextField()
    overlay_gcs_path = models.TextField()
    nuclei_count = models.IntegerField(blank=True, null=True)
    attention_rank = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["attention_rank"]

    def __str__(self):
        return f"{self.ai_result.case.specimen_id} - patch #{self.attention_rank}"


class GenePrediction(models.Model):
    """TP53 / KEAP1 / KRAS. Probability is used as-is — no separate binary call."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ai_result = models.ForeignKey(AIAnalysisResult, on_delete=models.CASCADE, related_name="gene_predictions")
    gene_name = models.CharField(max_length=50)
    likelihood = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["ai_result", "gene_name"], name="uniq_ai_result_gene")
        ]
        ordering = ["gene_name"]

    def __str__(self):
        return f"{self.ai_result.case.specimen_id} - {self.gene_name}: {self.likelihood}"


class ConfirmedFinding(models.Model):
    """
    The doctor's final call — one per case. Either the AI result taken
    as-is ("승인") or overwritten after review ("반려" in the UI, but
    there's no separate rejected/re-analysis state under the hood: both
    paths land here). CaseReviewLog is what distinguishes them for audit.
    """

    case = models.OneToOneField(Case, on_delete=models.CASCADE, primary_key=True, related_name="confirmed_finding")
    based_on_result = models.ForeignKey(AIAnalysisResult, on_delete=models.PROTECT, related_name="confirmations")
    final_subtype = models.CharField(max_length=10)
    final_note = models.TextField(blank=True)
    confirmed_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="confirmed_findings",
                                      limit_choices_to={"role": "doctor"})
    confirmed_at = models.DateTimeField(auto_now_add=True)
    released_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="released_findings",
        limit_choices_to={"role": "doctor"},
        null=True,
        blank=True,
    )
    released_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.case.specimen_id} → {self.final_subtype}"


class CaseReviewLog(models.Model):
    class Action(models.TextChoices):
        CONFIRMED = "confirmed", "그대로 승인"
        EDITED = "edited", "수정 후 확정"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="review_logs")
    reviewer = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="review_logs",
                                  limit_choices_to={"role": "doctor"})
    action = models.CharField(max_length=10, choices=Action.choices)
    subtype_at_time = models.CharField(max_length=10)
    note_at_time = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.case.specimen_id} · {self.action} · {self.created_at:%Y-%m-%d}"


class CaseFinding(models.Model):
    """Freehand annotation strokes over the slide viewer (heatmap/overlay/original)."""

    class Mode(models.TextChoices):
        HEATMAP = "heatmap", "히트맵"
        OVERLAY = "overlay", "오버레이"
        ORIGINAL = "original", "원본"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="findings")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="case_findings",
                              limit_choices_to={"role": "doctor"})
    mode = models.CharField(max_length=10, choices=Mode.choices)
    strokes = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.case.specimen_id} · {self.mode} drawing by {self.user.name}"


class CaseFavorite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorite_cases",
                              limit_choices_to={"role": "doctor"})
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "case"], name="uniq_user_case_favorite")
        ]

    def __str__(self):
        return f"{self.user.name} ♥ {self.case.specimen_id}"
