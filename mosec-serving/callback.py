"""
Django에 진행 단계를 알리는 콜백.
"""

import os
import requests

DJANGO_CALLBACK_URL = os.environ.get("DJANGO_CALLBACK_URL", "https://lung-cdss.kro.kr/api")
INTERNAL_CALLBACK_TOKEN = os.environ.get("INTERNAL_CALLBACK_TOKEN")


def update_step(case_id: str, step: str):
    try:
        requests.post(
            f"{DJANGO_CALLBACK_URL}/cases/{case_id}/step/",
            json={"step": step},
            headers={"X-Internal-Token": INTERNAL_CALLBACK_TOKEN},
            timeout=5,
        )
    except Exception as e:
        print(f"[callback] step 업데이트 실패 ({step}): {e}", flush=True)