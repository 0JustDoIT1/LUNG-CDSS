import os
import json
import uuid
import torch
import torch.nn.functional as F
import openslide
from PIL import Image
from mosec import Server, Worker

from model import AMDMIL
from gene_model import MultiLabelAMDMIL
from preprocessing import get_tissue_patch_coords, get_slide_thumbnail, PATCH_SIZE
from feature_extraction import load_uni2h, extract_embeddings
from nuclei_analysis import extract_top_attention_patches, segment_nuclei, get_nuclei_overlay, summarize_nuclei_metrics
from heatmap import generate_heatmap
from gcs_utils import GCS_BUCKET, download_slide_from_gcs, upload_image_to_gcs, download_model_file_from_gcs
from callback import update_step

MODEL_WEIGHTS_PATH = f"gs://{GCS_BUCKET}/models/amd_mil_100test_best.pt"
MODEL_CONFIG_PATH = f"gs://{GCS_BUCKET}/models/amd_mil_100test_config.json"

GENE_MODEL_WEIGHTS_PATH = f"gs://{GCS_BUCKET}/models/multilabel_amd_mil_weights.pt"
GENE_MODEL_CONFIG_PATH = f"gs://{GCS_BUCKET}/models/multilabel_amd_mil_config.json"


class LungCDSSWorker(Worker):
    def __init__(self):
        super().__init__()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # 기존 AMD-MIL 분류 모델 로드
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

        # 유전자 예측 모델 로드
        download_model_file_from_gcs(GENE_MODEL_CONFIG_PATH, "/tmp/gene_config.json")
        download_model_file_from_gcs(GENE_MODEL_WEIGHTS_PATH, "/tmp/gene_weights.pt")

        with open("/tmp/gene_config.json") as f:
            gene_config = json.load(f)

        self.gene_labels = gene_config["label_columns"]
        self.gene_model = MultiLabelAMDMIL(
            input_dim=gene_config.get("input_dim", 1536),
            embed_dim=gene_config["architecture"]["embed_dim"],
            agent_num=gene_config["architecture"]["agent_num"],
            num_heads=gene_config["architecture"]["num_heads"],
            num_labels=gene_config["num_labels"],
            dropout=gene_config["architecture"]["dropout"],
        ).to(self.device)

        gene_state_dict = torch.load("/tmp/gene_weights.pt", map_location=self.device)
        self.gene_model.load_state_dict(gene_state_dict)
        self.gene_model.eval()

        self.uni2h_model, self.uni2h_transform = load_uni2h()

    def forward(self, data: dict) -> dict:
        case_id = data["case_id"]
        print(f"[{case_id}] 시작", flush=True)

        local_svs_path = f"/tmp/{uuid.uuid4()}.svs"
        download_slide_from_gcs(data["slide_gcs_path"], local_svs_path)
        print(f"[{case_id}] GCS 다운로드 완료", flush=True)
        update_step(case_id, "preprocessing")

        slide = openslide.OpenSlide(local_svs_path)
        coords = get_tissue_patch_coords(slide)
        print(f"[{case_id}] 패치 좌표 생성 완료: {len(coords)}개", flush=True)
        update_step(case_id, "feature_extraction")

        bag_features = extract_embeddings(
            self.uni2h_model, self.uni2h_transform, local_svs_path, coords, patch_size=PATCH_SIZE
        )
        print(f"[{case_id}] UNI2-h 특징추출 완료: {bag_features.shape}", flush=True)
        update_step(case_id, "classification")

        with torch.no_grad():
            x = bag_features.to(self.device).float()

            output = self.model(x, return_attention=True)
            probs = F.softmax(output["logits"], dim=1)[0]
            attention = output["attention"][0].cpu().numpy()

            import numpy as np
            print(
                f"[{case_id}] attn stats — min:{attention.min():.6f} max:{attention.max():.6f} "
                f"mean:{attention.mean():.6f} p50:{np.percentile(attention,50):.6f} "
                f"p90:{np.percentile(attention,90):.6f} p99:{np.percentile(attention,99):.6f} "
                f"max/median비율:{attention.max()/(np.percentile(attention,50)+1e-8):.2f}",
                flush=True,
            )

            # 유전자 예측 — 같은 UNI2-h 임베딩(x) 재사용, 재추출 없음
            gene_output = self.gene_model(x)
            gene_probs = torch.sigmoid(gene_output["logits"])[0]

        gene_predictions_result = [
            {"gene_name": gene_name, "likelihood": gene_probs[i].item()}
            for i, gene_name in enumerate(self.gene_labels)
        ]

        print(f"[{case_id}] AMD-MIL 분류 완료", flush=True)
        update_step(case_id, "nuclei_detection")

        luad_prob = probs[1].item()
        lusc_prob = probs[0].item()

        thumbnail = get_slide_thumbnail(slide, max_size=4096)
        heatmap_img = generate_heatmap(thumbnail, coords, attention, slide.level_dimensions[0], patch_size=PATCH_SIZE)
        print(f"[{case_id}] 히트맵 생성 완료", flush=True)

        top_patches = extract_top_attention_patches(attention, coords, slide, patch_size=PATCH_SIZE, top_n=5)
        slide.close()
        os.remove(local_svs_path)
        print(f"[{case_id}] 상위 패치 {len(top_patches)}개 추출 완료", flush=True)

        nuclei_patches_result = []
        all_nuclei = []
        for rank, p in enumerate(top_patches):
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
        update_step(case_id, "generating_result")

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
            "gene_predictions": gene_predictions_result,
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