"""
WSI 원본 썸네일 생성 (썸네일 전용 서비스).
"""

from PIL import Image
import openslide


def get_slide_thumbnail(slide: openslide.OpenSlide, max_size: int = 4096) -> Image.Image:
    """결과 화면 원본 뷰용 고해상도 썸네일 (확대/팬 대응, Deep Zoom 아님)."""
    return slide.get_thumbnail((max_size, max_size))