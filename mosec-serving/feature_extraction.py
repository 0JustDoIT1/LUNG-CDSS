"""
UNI2-h 특징추출.
"""

import torch
import timm
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


def load_uni2h():
    model = timm.create_model("hf-hub:MahmoodLab/UNI2-h", pretrained=True, **TIMM_KWARGS)
    model.eval().to(DEVICE)
    transform = timm.data.create_transform(
        **timm.data.resolve_data_config(model.pretrained_cfg, model=model)
    )
    return model, transform


def extract_embeddings(model, transform, slide, coords, patch_size, batch_size=512, max_io_workers=16):
    """
    이미 열려있는 slide 객체를 받아서 패치별 임베딩 추출.
    패치 이미지 읽기(I/O)는 ThreadPoolExecutor로 병렬화.
    반환: [N_patches, 1536] float16 텐서
    """

    def read_and_transform(coord):
        x0, y0, level = coord
        patch = slide.read_region((int(x0), int(y0)), level, (patch_size, patch_size)).convert("RGB")
        return transform(patch)

    embeddings = []
    with torch.no_grad():
        for i in range(0, len(coords), batch_size):
            batch_coords = coords[i:i + batch_size]

            with ThreadPoolExecutor(max_workers=max_io_workers) as executor:
                batch_tensors = list(executor.map(read_and_transform, batch_coords))

            batch = torch.stack(batch_tensors).to(DEVICE, non_blocking=True)

            with torch.autocast(device_type="cuda" if DEVICE == "cuda" else "cpu", dtype=torch.float16):
                feats = model(batch)

            embeddings.append(feats.cpu().to(torch.float16))

    if embeddings:
        return torch.cat(embeddings, dim=0)
    return torch.empty((0, model.num_features), dtype=torch.float16)