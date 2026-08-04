"""
전체 API 공통 에러 응답 포맷.

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "사람이 읽을 수 있는 메시지",
    "details": { ... }   # 선택, 필드별 검증 오류 등
  }
}

성공 응답은 그대로 각 시리얼라이저 결과를 반환한다(래핑 안 함) — 지금까지
Swagger 문서에 반영된 성공응답 스키마와 어긋나지 않게 하기 위함. 에러
포맷만 통일 대상이다.
"""

from rest_framework.response import Response


class ErrorCode:
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    CONFLICT = "CONFLICT"
    UPSTREAM_ERROR = "UPSTREAM_ERROR"  # mosec/RAG 등 외부 서비스 호출 실패
    INTERNAL_ERROR = "INTERNAL_ERROR"


_STATUS_TO_CODE = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.AUTHENTICATION_FAILED,
    403: ErrorCode.PERMISSION_DENIED,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    502: ErrorCode.UPSTREAM_ERROR,
}


def error_response(message: str, *, code: str = None,
                    status_code: int = 400, details=None) -> Response:
    # code를 명시적으로 안 주면 status_code로부터 자동 유추
    # (예: status_code=401인데 code 지정 안 하면 자동으로 AUTHENTICATION_FAILED)
    resolved_code = code or _STATUS_TO_CODE.get(status_code, ErrorCode.INTERNAL_ERROR)
    body = {"error": {"code": resolved_code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return Response(body, status=status_code)


def validation_error_response(serializer_errors, message: str = "입력값을 확인해주세요") -> Response:
    return error_response(message, code=ErrorCode.VALIDATION_ERROR, status_code=400,
                           details=serializer_errors)
