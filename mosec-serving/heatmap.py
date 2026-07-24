"""
어텐션 히트맵 생성.
"""

import numpy as np
from PIL import Image
import matplotlib as mpl


def generate_heatmap(thumbnail: Image.Image, coords: list, attention: np.ndarray,
                      level0_dims: tuple, patch_size: int = 256) -> Image.Image:
    thumb_np = np.array(thumbnail.convert("RGB"))
    thumb_h, thumb_w = thumb_np.shape[:2]
    level0_w, level0_h = level0_dims

    scale_x = thumb_w / level0_w
    scale_y = thumb_h / level0_h

    attn_norm = (attention - attention.min()) / (attention.max() - attention.min() + 1e-8)

    heatmap = np.zeros((thumb_h, thumb_w), dtype=np.float32)
    count_map = np.zeros((thumb_h, thumb_w), dtype=np.float32)

    for (x0, y0, _level), weight in zip(coords, attn_norm):
        tx = int(x0 * scale_x)
        ty = int(y0 * scale_y)
        patch_thumb_size = max(1, int(patch_size * scale_x))
        heatmap[ty:ty + patch_thumb_size, tx:tx + patch_thumb_size] += weight
        count_map[ty:ty + patch_thumb_size, tx:tx + patch_thumb_size] += 1

    count_map[count_map == 0] = 1
    heatmap = heatmap / count_map

    colormap = mpl.colormaps["jet"]
    heatmap_rgb = (colormap(heatmap)[:, :, :3] * 255).astype(np.uint8)

    overlay = (thumb_np.astype(np.float32) * 0.5 + heatmap_rgb.astype(np.float32) * 0.5).astype(np.uint8)
    return Image.fromarray(overlay)