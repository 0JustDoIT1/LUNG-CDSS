"""
GCS signed URL 생성.
"""

import uuid
from google.cloud import storage
from datetime import timedelta

GCS_BUCKET = "shining-lamp-492601-f9-lung-cdss"
_client = storage.Client()
_bucket = _client.bucket(GCS_BUCKET)


def gcs_path_to_signed_url(gcs_path: str, expiration_minutes: int = 60) -> str | None:
    """
    'gs://bucket/path' 형태를 실제 접근 가능한 signed URL로 변환.
    gcs_path가 None이면 None 반환.
    """
    if not gcs_path:
        return None

    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    blob = _bucket.blob(blob_name)

    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url


def delete_case_reports(case_id: str):
    """
    reports/{case_id}/ 폴더 정리 (재분석 시 이전 결과 이미지 삭제).
    단, original.png(업로드 시점에 생성된 썸네일)는 원본 슬라이드가 그대로면
    재사용해야 하므로 삭제 대상에서 제외.
    """
    prefix = f"reports/{case_id}/"
    blobs = _bucket.list_blobs(prefix=prefix)
    for blob in blobs:
        if blob.name == f"{prefix}original.png":
            continue
        blob.delete()


def delete_slide_file(gcs_path: str):
    """원본 슬라이드 파일 삭제 (케이스 자체 삭제 시에만 사용)"""
    if not gcs_path:
        return
    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    blob = _bucket.blob(blob_name)
    if blob.exists():
        blob.delete()


def generate_upload_url(filename: str, expiration_minutes: int = 15) -> dict:
    """PUT용 signed URL 발급 (원본 슬라이드 업로드용)"""
    blob_name = f"uploads/{uuid.uuid4()}_{filename}"
    blob = _bucket.blob(blob_name)

    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=expiration_minutes),
        method="PUT",
        content_type="application/octet-stream",
    )
    return {
        "upload_url": url,
        "gcs_path": f"gs://{GCS_BUCKET}/{blob_name}",
    }