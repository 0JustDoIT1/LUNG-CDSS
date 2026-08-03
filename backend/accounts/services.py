"""
외부 연동이 필요한 두 지점을 한 곳에 모아둠:
  1. 소셜로그인 토큰 재검증 (구글/카카오/네이버) — Flutter가 준 토큰을 그대로
     믿지 않고 서버가 각 소셜사에 직접 재확인한다.
  2. 의사면허번호 검증 (건강보험심사평가원 등) — 회원가입 폼 안에서 인라인으로
     확인하는 지점.

지금은 실제 API 키/엔드포인트가 없는 상태라 스텁으로 구현되어 있고,
LicenseVerificationError / SocialTokenError를 던지는 지점만 실제 연동 코드로
교체하면 된다.
"""

import os

import requests


class SocialTokenError(Exception):
    pass


class LicenseVerificationError(Exception):
    pass


def verify_social_token(provider: str, token: str) -> dict:
    """
    소셜사에 토큰을 재검증하고 {"social_uid": str, "name": str|None} 반환.
    반드시 서버가 직접 소셜사 API를 호출해서 검증해야 함 — 클라이언트가 준
    social_uid를 그대로 믿으면 위조 가능.
    """
    if provider == "google":
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo", params={"id_token": token}, timeout=5
        )
        if resp.status_code != 200:
            raise SocialTokenError("구글 토큰 검증에 실패했습니다")
        data = resp.json()

        # aud(토큰이 어느 클라이언트용으로 발급됐는지) 검증 필수 —
        # 이거 없으면 "유효하기만 한" 아무 구글앱 토큰으로도 로그인 우회 가능함.
        expected_client_ids = [
            c for c in os.environ.get("GOOGLE_OAUTH_CLIENT_IDS", "").split(",") if c
        ]
        if expected_client_ids and data.get("aud") not in expected_client_ids:
            raise SocialTokenError("이 앱에서 발급되지 않은 토큰입니다")

        return {"social_uid": data["sub"], "name": data.get("name")}

    if provider == "kakao":
        resp = requests.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        if resp.status_code != 200:
            raise SocialTokenError("카카오 토큰 검증에 실패했습니다")
        data = resp.json()
        return {"social_uid": str(data["id"]), "name": None}

    if provider == "naver":
        resp = requests.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        if resp.status_code != 200:
            raise SocialTokenError("네이버 토큰 검증에 실패했습니다")
        data = resp.json().get("response", {})
        return {"social_uid": data["id"], "name": data.get("name")}

    raise SocialTokenError(f"지원하지 않는 provider: {provider}")


def verify_doctor_license(license_number: str) -> bool:
    """
    건강보험심사평가원 등 의사면허 검증 API 호출.
    TODO: 실제 발급받은 API 엔드포인트/키로 교체.
    지금은 자릿수만 확인하는 임시 스텁 — 실서비스 배포 전 필수 교체 지점.
    """
    api_url = os.environ.get("DOCTOR_LICENSE_VERIFY_URL")
    api_key = os.environ.get("DOCTOR_LICENSE_VERIFY_KEY")

    if not api_url:
        # 개발 환경 폴백: 6자리 숫자면 통과시킴
        return bool(license_number) and license_number.isdigit() and len(license_number) == 6

    resp = requests.get(
        api_url, params={"license_number": license_number, "key": api_key}, timeout=5
    )
    if resp.status_code != 200:
        raise LicenseVerificationError("면허 확인 서버에 연결할 수 없습니다")
    return resp.json().get("verified", False)
