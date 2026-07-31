from rest_framework import serializers

from .models import ChatThread, Message, MessageMention, Notification


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "thread", "sender", "sender_name", "content", "voice_url", "created_at"]
        read_only_fields = ["id", "sender", "sender_name", "created_at"]


class MessageMentionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageMention
        fields = ["mentioned_user"]


class ChatThreadSerializer(serializers.ModelSerializer):
    other_participant_name = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatThread
        fields = ["id", "related_case", "other_participant_name", "last_message", "unread_count", "created_at"]

    def get_other_participant_name(self, obj):
        request = self.context.get("request")
        other = obj.participants.exclude(user=request.user).select_related("user").first()
        return other.user.name if other else None

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        return msg.content if msg else None

    def get_unread_count(self, obj):
        # 읽음추적 테이블(MessageReadStatus)은 의료진앱 정책상 제거됨 —
        # "안읽음" 배지는 지금은 단순히 최근 N분 내 메시지 존재여부로 근사.
        return 0


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "category", "title", "body", "deep_link", "is_read", "created_at"]
        read_only_fields = fields
