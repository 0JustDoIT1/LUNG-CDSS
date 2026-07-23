import os
import json
import uuid
import torch
import torch.nn.functional as F
import openslide
from PIL import Image
from mosec import Server, Worker

from model import AMDMIL
from preprocessing import get_tissue_patch_coords, get_slide_thumbnail, PATCH_SIZE
from feature_extraction import load_uni2h, extract_embeddings
from nuclei_analysis import extract_top_attention_patches, segment_nuclei, get_nuclei_overlay, summarize_nuclei_metrics
from heatmap import generate_heatmap
from gcs_utils import GCS_BUCKET, download_slide_from_gcs, upload_image_to_gcs, download_model_file_from_gcs

MODEL_WEIGHTS_PATH = f"gs://{GCS_BUCKET}/models/amd_mil_100test_best.pt"
MODEL_CONFIG_PATH = f"gs://{GCS_BUCKET}/models/amd_mil_100test_config.json"


class LungCDSSWorker(Worker):
    def __init__(self):
        super().__init__()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        download_model_file_from_gcs(MODEL_CONFIG_PATH, "/tmp/config.json")
        download_model_file_from_gcs(MODEL_WEIGHTS_PATH, "/tmp/weights.pt")

        with open("/tmp/config.json") as f:
            config = json.load(f)

        self.model = AMDMIL(
            input_dim=config.get("input_dim", 1536),
            embed_dim=config.get("embed_dim", 384),
            agent_num=config.get("agent_num", 128),
            num_heads=config.get("num_heads", 8),
        ).to(self.device)

        state_dict = torch.load("/tmp/weights.pt", map_location=self.device)
        self.model.load_state_dict(state_dict)
        self.model.eval()

        self.uni2h_model, self.uni2h_transform = load_uni2h()

    def forward(self, data: dict) -> dict:
        case_id = data["case_id"]
        print(f"[{case_id}] 시작", flush=True)

        local_svs_path = f"/tmp/{uuid.uuid4()}.svs"
        download_slide_from_gcs(data["slide_gcs_path"], local_svs_path)
        print(f"[{case_id}] GCS 다운로드 완료", flush=True)

        slide = openslide.OpenSlide(local_svs_path)
        coords = get_tissue_patch_coords(slide)
        print(f"[{case_id}] 패치 좌표 생성 완료: {len(coords)}개", flush=True)

        bag_features = extract_embeddings(
            self.uni2h_model, self.uni2h_transform, local_svs_path, coords, patch_size=PATCH_SIZE
        )
        print(f"[{case_id}] UNI2-h 특징추출 완료: {bag_features.shape}", flush=True)

        with torch.no_grad():
            x = bag_features.to(self.device).float()
            output = self.model(x, return_attention=True)
            probs = F.softmax(output["logits"], dim=1)[0]
            attention = output["attention"][0].cpu().numpy()
        print(f"[{case_id}] AMD-MIL 분류 완료", flush=True)

        luad_prob = probs[1].item()
        lusc_prob = probs[0].item()

        thumbnail = get_slide_thumbnail(slide, max_size=4096)
        heatmap_img = generate_heatmap(thumbnail, coords, attention, slide.level_dimensions[0], patch_size=PATCH_SIZE)
        print(f"[{case_id}] 히트맵 생성 완료", flush=True)

        top_patches = extract_top_attention_patches(attention, coords, slide, patch_size=PATCH_SIZE, top_pct=0.1)
        slide.close()
        os.remove(local_svs_path)
        print(f"[{case_id}] 상위 패치 {len(top_patches)}개 추출 완료", flush=True)

        nuclei_patches_result = []
        all_nuclei = []
        for rank, p in enumerate(top_patches[:5]):
            nuclei = segment_nuclei(p["image"])
            overlay_img, n_nuclei = get_nuclei_overlay(p["image"])
            all_nuclei.extend(nuclei)

            original_path = upload_image_to_gcs(Image.fromarray(p["image"]), f"reports/{case_id}/nuclei_{rank}_original.png")
            overlay_path = upload_image_to_gcs(Image.fromarray(overlay_img), f"reports/{case_id}/nuclei_{rank}_overlay.png")

            nuclei_patches_result.append({
                "attention_rank": rank,
                "nuclei_count": n_nuclei,
                "original_gcs_path": original_path,
                "overlay_gcs_path": overlay_path,
            })
        print(f"[{case_id}] 핵 형태 분석 완료", flush=True)

        nuclei_summary = summarize_nuclei_metrics(all_nuclei, n_patches=len(top_patches))

        slide_thumb_path = upload_image_to_gcs(thumbnail, f"reports/{case_id}/original.png")
        heatmap_path = upload_image_to_gcs(heatmap_img, f"reports/{case_id}/heatmap.png")
        print(f"[{case_id}] 결과 이미지 업로드 완료", flush=True)

        return {
            "prediction_label": "LUAD" if luad_prob > lusc_prob else "LUSC",
            "luad_probability": luad_prob,
            "lusc_probability": lusc_prob,
            "slide_thumbnail_gcs_path": slide_thumb_path,
            "heatmap_gcs_path": heatmap_path,
            "nuclei_patches": nuclei_patches_result,
            **nuclei_summary,
            "gene_predictions": [],
        }


if __name__ == "__main__":
    server = Server()
    server.append_worker(
        LungCDSSWorker,
        num=1,
        max_batch_size=1,
        max_wait_time=10,
        timeout=900,
    )
    server.run()