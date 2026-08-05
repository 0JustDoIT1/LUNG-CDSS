"""
GCS 다운로드/업로드.
"""

from google.cloud import storage
from PIL import Image
import io
import os

GCS_BUCKET = "shining-lamp-492601-f9-lung-cdss"
_client = storage.Client()
_bucket = _client.bucket(GCS_BUCKET)


def download_slide_from_gcs(gcs_path: str, local_path: str):
    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    blob = _bucket.blob(blob_name)
    print(f"GCS 다운로드 시작: {blob_name}", flush=True)
    blob.download_to_filename(local_path, timeout=300)
    print(f"GCS 다운로드 완료: {blob_name} ({os.path.getsize(local_path)} bytes)", flush=True)


def upload_image_to_gcs(image: Image.Image, gcs_path: str) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    _bucket.blob(blob_name).upload_from_file(buffer, content_type="image/png", timeout=60)
    return f"gs://{GCS_BUCKET}/{blob_name}"
