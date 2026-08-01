from rest_framework.views import exception_handler as drf_default_handler

from .responses import ErrorCode, validation_error_response

_CODE_MAP = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.AUTHENTICATION_FAILED,
    403: ErrorCode.PERMISSION_DENIED,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.VALIDATION_ERROR,
    409: ErrorCode.CONFLICT,
    429: ErrorCode.VALIDATION_ERROR,
}


def custom_exception_handler(exc, context):
    """
    뷰 안에서 error_response()로 직접 처리하지 않은 예외(404, 403, 401,
    throttle, serializer.is_valid(raise_exception=True) 등)를 동일 포맷으로
    맞춰준다. 뷰 코드가 이미 error_response를 쓴 경우는 여기까지 안 옴.
    """
    response = drf_default_handler(exc, context)
    if response is None:
        return None

    code = _CODE_MAP.get(response.status_code, ErrorCode.INTERNAL_ERROR)

    if isinstance(response.data, dict) and "detail" in response.data:
        message = str(response.data["detail"])
        response.data = {"error": {"code": code, "message": message}}
    else:
        # serializer.is_valid(raise_exception=True)로 발생한 필드별 오류 등
        response.data = {
            "error": {
                "code": code,
                "message": "입력값을 확인해주세요",
                "details": response.data,
            }
        }

    return response
