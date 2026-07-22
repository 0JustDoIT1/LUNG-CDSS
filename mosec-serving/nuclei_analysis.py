"""
scikit-image 기반 핵 분할, 형태계측, 오버레이 생성, 어텐션 상위 패치 추출.
"""

import numpy as np
from skimage.color import rgb2hed
from skimage.filters import threshold_otsu
from skimage.morphology import remove_small_objects, binary_opening, disk
from skimage.segmentation import watershed, find_boundaries
from skimage.feature import peak_local_max
from skimage.measure import label, regionprops
from scipy import ndimage as ndi


def _watershed_labels(patch_img: np.ndarray, min_nucleus_size: int = 20):
    hed = rgb2hed(patch_img)
    hematoxylin = hed[:, :, 0]
    h_norm = (hematoxylin - hematoxylin.min()) / (hematoxylin.max() - hematoxylin.min() + 1e-8)

    try:
        thresh = threshold_otsu(h_norm)
    except ValueError:
        return None

    binary = h_norm > thresh
    binary = binary_opening(binary, disk(1))
    binary = remove_small_objects(binary, min_size=min_nucleus_size)
    if binary.sum() == 0:
        return None

    distance = ndi.distance_transform_edt(binary)
    coords = peak_local_max(distance, min_distance=5, labels=binary)
    mask = np.zeros(distance.shape, dtype=bool)
    mask[tuple(coords.T)] = True
    markers = label(mask)
    return watershed(-distance, markers, mask=binary)


def segment_nuclei(patch_img: np.ndarray, min_nucleus_size: int = 20) -> list[dict]:
    labels_ws = _watershed_labels(patch_img, min_nucleus_size)
    if labels_ws is None:
        return []

    results = []
    for region in regionprops(labels_ws):
        if region.area < min_nucleus_size:
            continue
        results.append({
            "area": region.area,
            "perimeter": region.perimeter,
            "eccentricity": region.eccentricity,
            "solidity": region.solidity,
        })
    return results


def get_nuclei_overlay(patch_img: np.ndarray, min_nucleus_size: int = 20):
    labels_ws = _watershed_labels(patch_img, min_nucleus_size)
    overlay = patch_img.copy()

    if labels_ws is None:
        return overlay, 0

    boundaries = find_boundaries(labels_ws, mode="outer")
    overlay[boundaries] = [255, 0, 0]

    n_nuclei = len([r for r in regionprops(labels_ws) if r.area >= min_nucleus_size])
    return overlay, n_nuclei


def extract_top_attention_patches(attention: np.ndarray, coords: list, slide, patch_size: int = 256, top_pct: float = 0.1):
    n = len(attention)
    n_top = max(1, int(n * top_pct))
    sorted_idx = np.argsort(attention)[::-1]
    top_idx = sorted_idx[:n_top]

    results = []
    for i in top_idx:
        x0, y0, level = coords[i]
        patch_img = slide.read_region((int(x0), int(y0)), level, (patch_size, patch_size)).convert("RGB")
        results.append({"coord": coords[i], "attn_value": float(attention[i]), "image": np.array(patch_img)})
    return results


def summarize_nuclei_metrics(nuclei_list: list[dict]) -> dict:
    if not nuclei_list:
        return {
            "nuclei_density_score": None, "nuclei_density_level": None,
            "nuclei_irregularity_score": None, "nuclei_irregularity_level": None,
        }
    total_count = len(nuclei_list)
    avg_solidity = float(np.mean([n["solidity"] for n in nuclei_list]))
    density_level = "높음" if total_count > 50 else "보통"
    irregularity_level = "뚜렷" if avg_solidity < 0.87 else "보통"
    return {
        "nuclei_density_score": total_count,
        "nuclei_density_level": density_level,
        "nuclei_irregularity_score": avg_solidity,
        "nuclei_irregularity_level": irregularity_level,
    }