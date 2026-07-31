from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import DoctorProfile, NurseProfile, User
from accounts.permissions import IsDoctorOrNurse

from .models import ChatThread, ChatThreadParticipant, Message, MessageMention, Notification
from .serializers import ChatThreadSerializer, MessageSerializer, NotificationSerializer
from .services import notify


def _my_department(user):
    if user.role == "doctor":
        profile = DoctorProfile.objects.filter(user=user).first()
    elif user.role == "nurse":
        profile = NurseProfile.objects.filter(user=user).first()
    else:
        return None
    return profile.department if profile else None


@api_view(["GET"])
@permission_classes([IsDoctorOrNurse])
def thread_list(request):
    """
    의사↔간호사 채팅만 존재. "같은 과" 상대 목록 = 채팅목록.
    실제로 대화를 나눈 스레드가 있으면 그걸, 없으면 상대 목록만 노출하는 게
    UX상 자연스럽지만 여기서는 "이미 생성된 스레드"만 반환하고,
    최초 대화는 start_thread로 상대를 지정해 생성한다.
    """
    threads = ChatThread.objects.filter(participants__user=request.user).distinct()
    return Response(ChatThreadSerializer(threads, many=True, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsDoctorOrNurse])
def department_counterparts(request):
    """같은 과 소속 상대(의사→간호사 / 간호사→의사) 목록. 채팅목록 화면의 '대화 시작 가능 대상'."""
    department = _my_department(request.user)
    if not department:
        return Response([])

    if request.user.role == "doctor":
        counterparts = User.objects.filter(role="nurse", nurse_profile__department=department)
    else:
        counterparts = User.objects.filter(role="doctor", doctor_profile__department=department)

    return Response([{"id": str(u.id), "name": u.name} for u in counterparts])


@api_view(["POST"])
@permission_classes([IsDoctorOrNurse])
def start_thread(request):
    counterpart_id = request.data.get("user_id")
    related_case_id = request.data.get("case_id")
    if not counterpart_id:
        return Response({"error": "user_id는 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

    counterpart = get_object_or_404(User, id=counterpart_id)

    # 이미 둘만의 스레드가 있으면 재사용
    existing = (
        ChatThread.objects.filter(participants__user=request.user)
        .filter(participants__user=counterpart)
        .first()
    )
    if existing:
        return Response(ChatThreadSerializer(existing, context={"request": request}).data)

    thread = ChatThread.objects.create(related_case_id=related_case_id)
    ChatThreadParticipant.objects.create(thread=thread, user=request.user)
    ChatThreadParticipant.objects.create(thread=thread, user=counterpart)
    return Response(ChatThreadSerializer(thread, context={"request": request}).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsDoctorOrNurse])
def message_list_create(request, thread_id):
    thread = get_object_or_404(ChatThread, id=thread_id, participants__user=request.user)

    if request.method == "GET":
        messages = thread.messages.select_related("sender")
        return Response(MessageSerializer(messages, many=True).data)

    content = request.data.get("content")
    voice_url = request.data.get("voice_url")
    mentioned_user_ids = request.data.get("mentioned_user_ids", [])

    if not content and not voice_url:
        return Response({"error": "content 또는 voice_url이 필요합니다"}, status=status.HTTP_400_BAD_REQUEST)

    message = Message.objects.create(thread=thread, sender=request.user, content=content, voice_url=voice_url)

    for uid in mentioned_user_ids:
        MessageMention.objects.create(message=message, mentioned_user_id=uid)
        notify(
            recipient_id=uid,
            category="chat",
            title=f"{request.user.name}님이 언급했습니다",
            body=content or "[음성메시지]",
            deep_link=f"/chat/{thread.id}",
        )

    # 멘션 대상이 아닌 나머지 참여자에게도 일반 채팅 알림
    other_participants = thread.participants.exclude(user=request.user).exclude(
        user_id__in=mentioned_user_ids
    )
    for participant in other_participants:
        notify(
            recipient_id=participant.user_id,
            category="chat",
            title=f"{request.user.name}",
            body=content or "[음성메시지]",
            deep_link=f"/chat/{thread.id}",
        )

    return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_list(request):
    notifications = Notification.objects.filter(recipient=request.user)
    return Response(NotificationSerializer(notifications, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_mark_read(request, notification_id):
    updated = Notification.objects.filter(id=notification_id, recipient=request.user).update(is_read=True)
    if not updated:
        return Response({"error": "찾을 수 없습니다"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"is_read": True})
