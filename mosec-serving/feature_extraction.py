"""
UNI2-h 특징추출.
"""

import torch
import timm
from timm.layers import SwiGLUPacked
from torch.utils.data import Dataset, DataLoader
import openslide

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

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
    """서버 시작 시 1회만 호출."""
    model = timm.create_model("hf-hub:MahmoodLab/UNI2-h", pretrained=True, **TIMM_KWARGS)
    model.eval().to(DEVICE)
    transform = timm.data.create_transform(
        **timm.data.resolve_data_config(model.pretrained_cfg, model=model)
    )
    return model, transform


class PatchDataset(Dataset):
    def __init__(self, svs_path, coords, patch_size, transform):
        self.svs_path = svs_path
        self.coords = coords
        self.patch_size = patch_size
        self.transform = transform
        self.slide = None

    def __len__(self):
        return len(self.coords)

    def __getitem__(self, idx):
        if self.slide is None:
            self.slide = openslide.OpenSlide(self.svs_path)
        x0, y0, level = self.coords[idx]
        patch = self.slide.read_region((x0, y0), level, (self.patch_size, self.patch_size)).convert("RGB")
        return self.transform(patch)


def extract_embeddings(model, transform, svs_path, coords, patch_size, batch_size=64, num_workers=0):
    dataset = PatchDataset(svs_path, coords, patch_size, transform)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=True)

    embeddings = []
    with torch.no_grad():
        for batch in loader:
            batch = batch.to(DEVICE, non_blocking=True)
            with torch.autocast(device_type="cuda" if DEVICE == "cuda" else "cpu", dtype=torch.float16):
                feats = model(batch)
            embeddings.append(feats.cpu().to(torch.float16))

    if embeddings:
        return torch.cat(embeddings, dim=0)
    return torch.empty((0, model.num_features), dtype=torch.float16)