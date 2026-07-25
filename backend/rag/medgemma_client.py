import os
from pathlib import Path

import google.auth.transport.requests
import google.oauth2.id_token
import requests
from dotenv import load_dotenv
from rag.exceptions import MedGemmaError

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv()

TREATMENT_SERVING_URL = os.getenv("TREATMENT_SERVING_URL", "").rstrip("/")
TREATMENT_SERVING_MODEL = os.getenv(
    "TREATMENT_SERVING_MODEL",
    "google/medgemma-4b-it",
)


def get_identity_token() -> str:
    """인증된 Cloud Run 서비스를 호출하기 위한 Google ID 토큰을 발급합니다."""
    if not TREATMENT_SERVING_URL:
        raise MedGemmaError(
            "TREATMENT_SERVING_URL 환경변수가 설정되지 않았습니다."
        )

    auth_request = google.auth.transport.requests.Request()

    try:
        return google.oauth2.id_token.fetch_id_token(
            auth_request,
            TREATMENT_SERVING_URL,
        )
    except Exception as error:
        raise MedGemmaError(
            f"Google 인증 토큰 발급에 실패했습니다: {error}"
        ) from error


def call_medgemma(
    prompt: str,
    max_tokens: int = 700,
    temperature: float = 0.2,
) -> str:
    """Cloud Run에서 실행 중인 MedGemma에 프롬프트를 전달합니다."""
    if not prompt.strip():
        raise MedGemmaError(
            "MedGemma에 전달할 프롬프트가 비어 있습니다."
        )

    token = get_identity_token()

    endpoint = (
        f"{TREATMENT_SERVING_URL}/v1/chat/completions"
    )

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": TREATMENT_SERVING_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "당신은 비소세포폐암 임상 의사결정 지원 시스템에서 "
                    "의료진 검토용 소견을 작성하는 보조 모델입니다.\n\n"

                    "반드시 다음 규칙을 따르세요.\n"
                    "1. 최종 답변은 한국어로 작성합니다.\n"
                    "2. 제공된 검색 근거만 사용하며, 근거에 없는 내용을 추정하지 않습니다.\n"
                    "3. 유전자명과 약물명은 영문 표기를 유지합니다.\n"
                    "4. 원저 연구·탐색적 분석 결과와 FDA 승인 정보를 명확히 구분합니다.\n"
                    "5. KRAS 예측 결과만으로 KRAS G12C 변이를 확정하지 않습니다.\n"
                    "6. Sotorasib 또는 Adagrasib은 KRAS G12C가 분자검사로 확인된 경우에만 "
                    "관련 가능성을 언급합니다.\n"
                    "7. WSI 기반 유전자 변이 예측은 분자검사를 대체하지 않는다고 명시합니다.\n"
                    "8. 환자의 병기, 치료 이력, PD-L1, 확정 유전자 검사 결과가 제공되지 않았다면 "
                    "확정적인 치료 처방이나 약제 선택을 하지 않습니다.\n"
                    "9. TP53 또는 KEAP1 연구 결과는 예후 및 치료 반응과 관련된 연구 근거로만 "
                    "설명하고, 단독으로 표준 치료를 결정하지 않습니다.\n"
                    "10. 근거가 불충분하면 불충분하다고 명확히 작성합니다."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        response = requests.post(
            endpoint,
            headers=headers,
            json=payload,
            timeout=900,
        )
        response.raise_for_status()
    except requests.exceptions.Timeout as error:
        raise MedGemmaError(
            "MedGemma 응답 시간이 초과되었습니다 (Cloud Run 콜드 스타트일 수 있습니다)."
        ) from error
    except requests.exceptions.RequestException as error:
        raise MedGemmaError(
            f"MedGemma 호출 중 오류가 발생했습니다: {error}"
        ) from error

    data = response.json()

    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as error:
        raise MedGemmaError(
            f"MedGemma 응답 형식이 예상과 다릅니다: {data}"
        ) from error