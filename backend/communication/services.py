"""
알림 발송 공통 지점. Notification 레코드는 항상 남기고, FCM은 실제
firebase-admin으로 발송한다.

NotificationPreference가 꺼져있으면 발송 자체를 스킵한다 (설정 화면 정책).
FCM 발송 실패는 notify() 자체를 실패시키지 않는다 — 알림 히스토리(Notification
레코드)는 이미 저장된 뒤라, 푸시가 안 갔다고 해서 API 호출 자체를 500으로
만들 이유가 없음(앱 안 알림함에서는 어차피 조회 가능).
"""

import logging

from django.db import transaction

from .models import Notification

logger = logging.getLogger(__name__)


def notify(recipient_id, category, title, body, deep_link=None):
    from accounts.models import NotificationPreference

    if category not in Notification.Category.values:
        raise ValueError(f"Unsupported notification category: {category}")

    pref = NotificationPreference.objects.filter(user_id=recipient_id, category=category).first()
    if pref is not None and not pref.enabled:
        return None

    notification = Notification.objects.create(
        recipient_id=recipient_id, category=category, title=title, body=body, deep_link=deep_link or "",
    )
    transaction.on_commit(
        lambda: _send_fcm(recipient_id, category, title, body, deep_link or ""),
    )
    return notification


def _send_fcm(recipient_id, category, title, body, deep_link):
    from accounts.models import DeviceToken

    tokens = list(DeviceToken.objects.filter(user_id=recipient_id))
    if not tokens:
        return

    try:
        from firebase_admin import messaging

        from .firebase import get_firebase_app
        app = get_firebase_app()
    except Exception as e:
        # 크레덴셜 미설정 등 — 개발환경 폴백으로 콘솔에만 남기고 계속 진행
        logger.warning("FCM 초기화 실패, 발송 스킵: %s", e)
        for t in tokens:
            print(f"[FCM:{t.app_type}] (미발송) token={t.fcm_token[:8]}... title={title!r} body={body!r}")
        return

    for device in tokens:
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={"deep_link": deep_link, "category": category},
            token=device.fcm_token,
        )
        try:
            messaging.send(message, app=app)
        except messaging.UnregisteredError:
            # 기기에서 앱 삭제/토큰 만료 — 더 이상 유효하지 않으니 정리
            device.delete()
        except Exception as e:
            logger.warning("FCM 발송 실패 (user=%s, app=%s): %s", recipient_id, device.app_type, e)
