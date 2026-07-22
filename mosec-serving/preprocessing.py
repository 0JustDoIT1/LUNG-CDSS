"""
WSI 배경 제거 + 조직 영역 타일 좌표 생성 + 결과 화면용 썸네일.
"""

import numpy as np
import openslide
from PIL import Image
from skimage.filters import threshold_otsu

MAX_MASK_THUMB_SIZE = 2000   # 조직 마스크 계산용 (내부 연산, 작아도 무방)
PATCH_SIZE = 256
TARGET_MPP = 0.5             # 20x 표준 배율


def get_tissue_patch_coords(slide: openslide.OpenSlide, patch_size: int = PATCH_SIZE, target_mpp: float = TARGET_MPP) -> list[tuple[int, int, int]]:
    """Otsu thresholding으로 배경 제거 후, 조직이 있는 영역만 patch_size 격자로 좌표 추출."""
    try:
        base_mpp = float(slide.properties.get("openslide.mpp-x", 0.25))
    except (TypeError, ValueError):
        base_mpp = 0.25

    downsample = target_mpp / base_mpp
    level = slide.get_best_level_for_downsample(downsample)
    level_downsample = slide.level_downsamples[level]
    level_dims = slide.level_dimensions[level]

    thumb = slide.get_thumbnail((MAX_MASK_THUMB_SIZE, MAX_MASK_THUMB_SIZE))
    thumb_gray = np.array(thumb.convert("L"))
    thresh = threshold_otsu(thumb_gray)
    tissue_mask = thumb_gray < thresh

    scale_x = level_dims[0] / tissue_mask.shape[1]
    scale_y = level_dims[1] / tissue_mask.shape[0]

    coords = []
    step = patch_size
    for y in range(0, level_dims[1], step):
        for x in range(0, level_dims[0], step):
            mask_x = min(int(x / scale_x), tissue_mask.shape[1] - 1)
            mask_y = min(int(y / scale_y), tissue_mask.shape[0] - 1)
            if tissue_mask[mask_y, mask_x]:
                x0 = int(x * level_downsample)
                y0 = int(y * level_downsample)
                coords.append((x0, y0, level))

    del thumb, thumb_gray, tissue_mask
    return coords


def get_slide_thumbnail(slide: openslide.OpenSlide, max_size: int = 4096) -> Image.Image:
    """결과 화면 원본 뷰용 고해상도 썸네일 (확대/팬 대응, Deep Zoom 아님)."""
    return slide.get_thumbnail((max_size, max_size))