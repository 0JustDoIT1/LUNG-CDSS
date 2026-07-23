"""
UNI2-h 특징추출.
"""

import time
import threading
import torch
import timm
import openslide
from timm.layers import SwiGLUPacked
from concurrent.futures import ThreadPoolExecutor

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[feature_extraction] device: {DEVICE}", flush=True)

TIMM_KWARGS = {
    "img_size": 224,
    "patch_size": 14,
    "depth": 24,
    "num_heads": 24,
    "init_values": 1e-5,
    "embed_dim": 1536,
    "mlp_ratio": 2.66667 * 2,
    "num_classes": 0,
    "no_embed_class": True,
    "mlp_layer": SwiGLUPacked,
    "act_layer": torch.nn.SiLU,
    "reg_tokens": 8,
    "dynamic_img_size": True,
}


# def load_uni2h():
#     model = timm.create_model("hf-hub:MahmoodLab/UNI2-h", pretrained=True, **TIMM_KWARGS)
#     model.eval().to(DEVICE)

#     if DEVICE == "cuda":
#         model = model.half()
#         print("[feature_extraction] model cast to fp16", flush=True)

#     transform = timm.data.create_transform(
#         **timm.data.resolve_data_config(model.pretrained_cfg, model=model)
#     )
#     return model, transform

def load_uni2h():
    model = timm.create_model("hf-hub:MahmoodLab/UNI2-h", pretrained=True, **TIMM_KWARGS)
    model.eval().to(DEVICE)

    if DEVICE == "cuda":
        model = model.half()
        model = torch.compile(model)
        print("[feature_extraction] model compiled", flush=True)

    transform = timm.data.create_transform(
        **timm.data.resolve_data_config(model.pretrained_cfg, model=model)
    )
    return model, transform


def extract_embeddings(model, transform, svs_path, coords, patch_size, batch_size=512, max_io_workers=16):
    """
    반환: [N_patches, 1536] float16 텐서

    최적화 사항:
    - 스레드별 독립 OpenSlide 인스턴스 (openslide C 바인딩의 스레드 락 회피)
    - ThreadPoolExecutor를 루프 밖에서 1회만 생성
    - inference_mode() 사용 (no_grad보다 추가 최적화)
    - I/O 시간 vs GPU 시간을 배치마다 로그로 측정
    """
    thread_local = threading.local()

    def get_thread_slide():
        if not hasattr(thread_local, "slide"):
            thread_local.slide = openslide.OpenSlide(svs_path)
        return thread_local.slide

    def read_and_transform(coord):
        x0, y0, level = coord
        slide = get_thread_slide()
        patch = slide.read_region((int(x0), int(y0)), level, (patch_size, patch_size)).convert("RGB")
        return transform(patch)

    embeddings = []
    total_io_time = 0.0
    total_gpu_time = 0.0

    with torch.inference_mode():
        with ThreadPoolExecutor(max_workers=max_io_workers) as executor:
            for i in range(0, len(coords), batch_size):
                batch_coords = coords[i:i + batch_size]

                t0 = time.perf_counter()
                batch_tensors = list(executor.map(read_and_transform, batch_coords))
                t1 = time.perf_counter()

                batch = torch.stack(batch_tensors).to(DEVICE)
                if DEVICE == "cuda":
                    batch = batch.half()
                feats = model(batch)
                if DEVICE == "cuda":
                    torch.cuda.synchronize()
                t2 = time.perf_counter()

                total_io_time += (t1 - t0)
                total_gpu_time += (t2 - t1)
                print(f"[extract_embeddings] batch {i//batch_size}: I/O={t1-t0:.2f}s GPU={t2-t1:.2f}s", flush=True)

                embeddings.append(feats.cpu().to(torch.float16))

    print(f"[extract_embeddings] 총합 I/O={total_io_time:.1f}s GPU={total_gpu_time:.1f}s", flush=True)

    if embeddings:
        return torch.cat(embeddings, dim=0)
    return torch.empty((0, model.num_features), dtype=torch.float16)