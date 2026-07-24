
"""
GCS 다운로드/업로드.
"""

from google.cloud import storage
from PIL import Image
import io

GCS_BUCKET = "shining-lamp-492601-f9-lung-cdss"
_client = storage.Client()
_bucket = _client.bucket(GCS_BUCKET)


def download_slide_from_gcs(gcs_path: str, local_path: str):
    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    _bucket.blob(blob_name).download_to_filename(local_path)


def upload_image_to_gcs(image: Image.Image, gcs_path: str) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    _bucket.blob(blob_name).upload_from_file(buffer, content_type="image/png")
    return f"gs://{GCS_BUCKET}/{blob_name}"


def download_model_file_from_gcs(gcs_path: str, local_path: str):
    blob_name = gcs_path.replace(f"gs://{GCS_BUCKET}/", "")
    _bucket.blob(blob_name).download_to_filename(local_path)