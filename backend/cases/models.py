import uuid
from django.db import models
from django.contrib.auth.models import User


class Case(models.Model):
    STATUS_CHOICES = [
        ("uploaded", "Uploaded"),        # 업로드 완료, 분석 전 (원본 뷰어만 표시)
        ("processing", "Processing"),    # "분석하기" 클릭 후 mosec 처리 중
        ("completed", "Completed"),      # 분석 완료
        ("failed", "Failed"),            # 분석 중 오류 발생
    ]
    REVIEW_STATUS_CHOICES = [
        ("ai_suggested", "AI Suggested"),  # 의사 검토 전 (기본값)
        ("confirmed", "Confirmed"),        # 의사가 AI 결과에 동의
        ("overridden", "Overridden"),      # 의사가 수정하여 확정
    ]
    LABEL_CHOICES = [
        ("LUAD", "LUAD"),
        ("LUSC", "LUSC"),
    ]
    STEP_CHOICES = [
        ("uploaded", "업로드 확인"),
        ("preprocessing", "전처리"),
        ("feature_extraction", "특징 추출"),
        ("nuclei_detection", "핵 검출"),
        ("classification", "분류"),
        ("generating_result", "결과 생성"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    specimen_id = models.CharField(max_length=100)

    # AI 처리 상태 (업로드 → 분석 요청 → 완료/실패)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="uploaded")
    current_step = models.CharField(max_length=30, choices=STEP_CHOICES, blank=True, null=True)

    # 파일 경로 (GCS)
    slide_gcs_path = models.TextField(blank=True, null=True)
    heatmap_gcs_path = models.TextField(blank=True, null=True)

    # 세포 형태 소견 (수치 + 화면 표시용 배지)
    nuclei_density_score = models.FloatField(blank=True, null=True)
    nuclei_density_level = models.CharField(max_length=20, blank=True, null=True)
    nuclei_irregularity_score = models.FloatField(blank=True, null=True)
    nuclei_irregularity_level = models.CharField(max_length=20, blank=True, null=True)

    # 분류 결과 (양쪽 클래스 확률 모두 저장)
    prediction_label = models.CharField(max_length=10, choices=LABEL_CHOICES, blank=True, null=True)
    luad_probability = models.FloatField(blank=True, null=True)
    lusc_probability = models.FloatField(blank=True, null=True)

    # 표적치료 추천 (RAG 생성 텍스트)
    treatment_note = models.TextField(blank=True, null=True)

    # 의사 검토 상태 (AI 처리 상태와는 별도 축)
    review_status = models.CharField(max_length=20, choices=REVIEW_STATUS_CHOICES, default="ai_suggested")
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_cases")
    reviewer_note = models.TextField(blank=True, null=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    analyzed_at = models.DateTimeField(blank=True, null=True)   # "분석하기" 클릭 시각
    completed_at = models.DateTimeField(blank=True, null=True)  # 분석 완료 시각

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.specimen_id} ({self.status})"


class NucleiPatch(models.Model):
    """
    어텐션 상위 패치별 핵 형태 오버레이 이미지.
    케이스 1개당 여러 장(대표 패치 여러 개) 존재 가능.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="nuclei_patches")
    original_gcs_path = models.TextField()
    overlay_gcs_path = models.TextField()
    nuclei_count = models.IntegerField(blank=True, null=True)
    attention_rank = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["attention_rank"]

    def __str__(self):
        return f"{self.case.specimen_id} - patch #{self.attention_rank}"


class GenePrediction(models.Model):
    """
    케이스별 유전자 변이 예측 결과.
    유전자 개수/모델 구조가 아직 미확정이라 별도 테이블로 분리.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="gene_predictions")
    gene_name = models.CharField(max_length=50)
    likelihood = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("case", "gene_name")
        ordering = ["gene_name"]

    def __str__(self):
        return f"{self.case.specimen_id} - {self.gene_name}: {self.likelihood}"