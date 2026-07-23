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


def extract_top_attention_patches(attention: np.ndarray, coords: list, slide, patch_size: int = 256, top_n: int = 5):
    n_top = min(top_n, len(attention))
    sorted_idx = np.argsort(attention)[::-1]
    top_idx = sorted_idx[:n_top]

    results = []
    for i in top_idx:
        x0, y0, level = coords[i]
        patch_img = slide.read_region((int(x0), int(y0)), level, (patch_size, patch_size)).convert("RGB")
        results.append({"coord": coords[i], "attn_value": float(attention[i]), "image": np.array(patch_img)})
    return results


def _classify_by_quartile(value: float, low_bound: float, high_bound: float, higher_is_more: bool = True) -> str:
    """
    low_bound, high_bound: 두 그룹(top/bottom attention)이 자연스럽게 갈리는 실측 경계값.
    higher_is_more: True면 값이 클수록 '높음' 방향(예: 핵 개수),
                     False면 값이 작을수록 '뚜렷' 방향(예: solidity).
    """
    if higher_is_more:
        if value >= high_bound:
            return "높음"
        elif value <= low_bound:
            return "낮음"
        else:
            return "보통"
    else:
        if value <= high_bound:
            return "뚜렷"
        elif value >= low_bound:
            return "낮음"
        else:
            return "보통"


def summarize_nuclei_metrics(nuclei_list: list[dict], n_patches: int = 5) -> dict:
    """
    참고: 경계값은 TransMIL 어텐션 기준 Mann-Whitney U 검정 결과의
    실측 사분위수(top vs bottom 그룹, n=124,121 패치)에서 차용.
    - n_nuclei: bottom 75%=74.0 / top 25%=78.0 (effect size -0.644, 유의함)
    - mean_solidity: bottom 50%=0.878 / top 50%=0.854 (effect size 0.523, 유의함)
    현재 모델(AMD-MIL)로 별도 재검증은 안 된 상태 — 추후 1,000+ 슬라이드로
    AMD-MIL 재학습 시 이 모델 기준으로 임계값 재산출 필요.
    """
    if not nuclei_list:
        return {
            "nuclei_density_score": None, "nuclei_density_level": None,
            "nuclei_irregularity_score": None, "nuclei_irregularity_level": None,
        }

    total_count = len(nuclei_list)
    avg_count_per_patch = total_count / n_patches
    avg_solidity = float(np.mean([n["solidity"] for n in nuclei_list]))

    density_level = _classify_by_quartile(avg_count_per_patch, low_bound=74.0, high_bound=78.0, higher_is_more=True)
    irregularity_level = _classify_by_quartile(avg_solidity, low_bound=0.854, high_bound=0.878, higher_is_more=False)

    return {
        "nuclei_density_score": round(avg_count_per_patch, 1),
        "nuclei_density_level": density_level,
        "nuclei_irregularity_score": avg_solidity,
        "nuclei_irregularity_level": irregularity_level,
    }