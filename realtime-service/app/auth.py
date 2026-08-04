"""
Django(simplejwt)가 발급한 JWT를 그대로 검증한다. 별도 인증서버를 두지 않고,
같은 SECRET_KEY(HS256)를 공유해서 토큰 하나로 Django REST / FastAPI 둘 다
통과하게 만드는 방식 — Flutter 입장에서는 로그인 한 번으로 모든 백엔드에
접근 가능해야 하므로 이게 맞다.
"""

import os

import jwt
from fastapi import HTTPException, WebSocketException, status

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
ALGORITHM = "HS256"


class AuthUser:
    def __init__(self, user_id: str, role: str):
        self.user_id = user_id
        self.role = role


def decode_token(token: str) -> AuthUser:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("토큰이 만료되었습니다")
    except jwt.InvalidTokenError:
        raise ValueError("유효하지 않은 토큰입니다")

    user_id = payload.get("user_id")
    if not user_id:
        raise ValueError("토큰에 user_id가 없습니다")

    # role은 토큰에 안 실려있으므로(Django simplejwt 기본 클레임엔 없음),
    # 필요하면 Django REST 쪽에 /api/auth/me/ 같은 엔드포인트를 만들어 조회해야 함.
    # 지금은 채팅 스레드 참여자 검증을 Django REST 응답에 위임하므로 role 없이도 동작.
    return AuthUser(user_id=str(user_id), role=payload.get("role", ""))


def require_http_token(authorization: str | None) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer 토큰이 필요합니다")
    try:
        return decode_token(authorization.removeprefix("Bearer "))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


def require_ws_token(token: str | None) -> AuthUser:
    if not token:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="token 쿼리파라미터가 필요합니다")
    try:
        return decode_token(token)
    except ValueError as e:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason=str(e))
