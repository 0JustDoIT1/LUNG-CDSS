"""
Firebase Admin SDK 초기화. 앱 시작 시점(import time)에 바로 초기화하지 않고
실제로 발송 호출이 들어올 때 최초 1회만 초기화한다 — 크레덴셜 파일이
아직 없는 로컬/테스트 환경에서 서버 전체가 죽는 걸 방지하기 위함.
"""

import os

import firebase_admin
from firebase_admin import credentials

_app = None


def get_firebase_app():
    global _app
    if _app is not None:
        return _app

    cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH")
    if not cred_path or not os.path.exists(cred_path):
        raise RuntimeError(
            "FIREBASE_CREDENTIALS_PATH가 설정되지 않았거나 파일이 없습니다. "
            "Firebase 콘솔 > 프로젝트 설정 > 서비스 계정에서 발급받은 JSON 키 경로를 지정하세요."
        )

    cred = credentials.Certificate(cred_path)
    _app = firebase_admin.initialize_app(cred)
    return _app