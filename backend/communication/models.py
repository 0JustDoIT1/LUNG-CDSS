import uuid

from django.conf import settings
from django.db import models

from cases.models import Case

User = settings.AUTH_USER_MODEL


class ChatThread(models.Model):
    """의사-간호사 간 스레드만 존재. 환자는 채팅 기능 없음(AI챗봇만)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    related_case = models.ForeignKey(Case, on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name="chat_threads")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Thread {self.id}"


class ChatThreadParticipant(models.Model):
    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_threads")
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["thread", "user"], name="uniq_thread_participant")
        ]


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(ChatThread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    content = models.TextField(blank=True, null=True)
    voice_url = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.sender.name}: {(self.content or '[voice]')[:30]}"


class MessageMention(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="mentions")
    mentioned_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mentioned_in")


class Notification(models.Model):
    class Category(models.TextChoices):
        MEDICATION = "medication", "복약"
        APPOINTMENT = "appointment", "예약"
        CHAT = "chat", "채팅"
        TRIAGE = "triage", "증상위험도"
        CASE_REVIEW = "case_review", "케이스검토"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    category = models.CharField(max_length=20, choices=Category.choices)
    title = models.CharField(max_length=100)
    body = models.TextField()
    deep_link = models.CharField(max_length=255, blank=True, null=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.recipient.name} · {self.category} · {self.title}"
