"""
GCS signed URL 생성.
"""

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