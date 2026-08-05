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
    last_message_at = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatThread
        fields = [
            "id", "related_case", "other_participant_name", "last_message",
            "last_message_at", "unread_count", "created_at",
        ]

    def get_other_participant_name(self, obj):
        request = self.context.get("request")
        other = obj.participants.exclude(user=request.user).select_related("user").first()
        return other.user.name if other else None

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        return msg.content if msg else None

    def get_last_message_at(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        return msg.created_at if msg else None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return 0

        participant = obj.participants.filter(user=request.user).first()
        unread = obj.messages.exclude(sender=request.user)
        if participant and participant.last_read_at:
            unread = unread.filter(created_at__gt=participant.last_read_at)
        return unread.count()


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "category", "title", "body", "deep_link", "is_read", "created_at"]
        read_only_fields = fields
