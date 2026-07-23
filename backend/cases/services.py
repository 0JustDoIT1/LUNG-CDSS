"""
mosec Cloud Run 서비스 호출.
Cloud Run이 --no-allow-unauthenticated라서, 서비스 계정의 ID 토큰을 발급받아
Authorization 헤더에 실어 요청해야 함.
"""

import requests
import google.auth.transport.requests
import google.oauth2.id_token
from django.conf import settings


def _get_id_token(audience: str) -> str:
    """Cloud Run 서비스 호출용 ID 토큰 발급 (VM의 서비스 계정 자격 증명 사용)."""
    auth_req = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(auth_req, audience)


def call_mosec_predict(case_id: str, slide_gcs_path: str, timeout: int = 900) -> dict:
    """
    mosec에 추론 요청을 보내고 결과를 받아옴.
    mosec worker의 forward()가 반환하는 dict 형태 그대로 돌려줌.
    """
    token = _get_id_token(settings.MOSEC_URL)
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"case_id": case_id, "slide_gcs_path": slide_gcs_path}

    response = requests.post(
        f"{settings.MOSEC_URL}/inference",
        json=payload,
        headers=headers,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()