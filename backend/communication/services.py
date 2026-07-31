"""
알림 발송 공통 지점. Notification 레코드는 항상 남기고, FCM 실발송은
firebase-admin 연동 전까지 print 스텁으로 대체.

NotificationPreference가 꺼져있으면 발송 자체를 스킵한다 (설정 화면 정책).
"""

from .models import Notification


def notify(recipient_id, category, title, body, deep_link=None):
    from accounts.models import NotificationPreference

    pref = NotificationPreference.objects.filter(user_id=recipient_id, category=category).first()
    if pref is not None and not pref.enabled:
        return None

    notification = Notification.objects.create(
        recipient_id=recipient_id, category=category, title=title, body=body, deep_link=deep_link or "",
    )
    _send_fcm(recipient_id, title, body, deep_link)
    return notification


def _send_fcm(recipient_id, title, body, deep_link):
    from accounts.models import DeviceToken

    tokens = DeviceToken.objects.filter(user_id=recipient_id).values_list("fcm_token", "app_type")
    for token, app_type in tokens:
        # TODO: firebase-admin 연동. 지금은 콘솔 로그로만 확인.
        print(f"[FCM:{app_type}] token={token[:8]}... title={title!r} body={body!r} link={deep_link}")
