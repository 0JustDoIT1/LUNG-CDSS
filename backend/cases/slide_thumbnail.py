import os
import tempfile
from pathlib import Path

import openslide
from google.cloud import storage


storage_client = storage.Client()


def split_gcs_path(gcs_path: str) -> tuple[str, str]:
    if not gcs_path.startswith("gs://"):
        raise ValueError("올바른 GCS 경로가 아닙니다.")

    path = gcs_path.replace("gs://", "", 1)
    bucket_name, blob_name = path.split("/", 1)

    return bucket_name, blob_name


def create_slide_thumbnail(
    slide_gcs_path: str,
    case_id: str,
    max_size: tuple[int, int] = (1200, 800),
) -> str:
    bucket_name, blob_name = split_gcs_path(slide_gcs_path)

    bucket = storage_client.bucket(bucket_name)
    slide_blob = bucket.blob(blob_name)

    suffix = Path(blob_name).suffix or ".svs"

    with tempfile.TemporaryDirectory() as temp_dir:
        slide_path = os.path.join(temp_dir, f"slide{suffix}")
        thumbnail_path = os.path.join(temp_dir, "thumbnail.jpg")

        slide_blob.download_to_filename(slide_path)

        slide = openslide.OpenSlide(slide_path)

        try:
            thumbnail = slide.get_thumbnail(max_size).convert("RGB")
            thumbnail.save(thumbnail_path, "JPEG", quality=90)
        finally:
            slide.close()

        thumbnail_blob_name = f"thumbnails/{case_id}/thumbnail.jpg"
        thumbnail_blob = bucket.blob(thumbnail_blob_name)

        thumbnail_blob.upload_from_filename(
            thumbnail_path,
            content_type="image/jpeg",
        )

    return f"gs://{bucket_name}/{thumbnail_blob_name}"