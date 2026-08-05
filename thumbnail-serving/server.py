import os
import uuid
import openslide
from mosec import Server, Worker

from preprocessing import get_slide_thumbnail
from gcs_utils import download_slide_from_gcs, upload_image_to_gcs


class ThumbnailWorker(Worker):
    """
    업로드 직후 원본 뷰용 썸네일만 빠르게 생성하는 CPU 전용 워커.
    GPU 모델(UNI2-h, AMD-MIL)을 전혀 로드하지 않음 — mosec-serving(GPU)과 완전히 분리된 서비스.
    """

    def forward(self, data: dict) -> dict:
        case_id = data["case_id"]
        print(f"[{case_id}] 썸네일 생성 시작", flush=True)

        local_svs_path = f"/tmp/{uuid.uuid4()}.svs"
        slide = None
        try:
            download_slide_from_gcs(data["slide_gcs_path"], local_svs_path)

            print(f"[{case_id}] OpenSlide 파일 열기 시작", flush=True)
            slide = openslide.OpenSlide(local_svs_path)
            print(f"[{case_id}] 썸네일 렌더링 시작", flush=True)
            thumbnail = get_slide_thumbnail(slide, max_size=4096)
            print(f"[{case_id}] GCS 썸네일 업로드 시작", flush=True)
            thumb_path = upload_image_to_gcs(thumbnail, f"reports/{case_id}/original.png")
            print(f"[{case_id}] 썸네일 생성 완료 → {thumb_path}", flush=True)

            return {"slide_thumbnail_gcs_path": thumb_path}
        finally:
            if slide is not None:
                slide.close()
            if os.path.exists(local_svs_path):
                os.remove(local_svs_path)


if __name__ == "__main__":
    server = Server()
    server.append_worker(
        ThumbnailWorker,
        num=1,
        max_batch_size=1,
        max_wait_time=5,
        timeout=900,
        route="/thumbnail",
    )
    server.run()
