from django.contrib import admin

from .models import ChatThread, ChatThreadParticipant, Message, MessageMention, Notification

admin.site.register(ChatThread)
admin.site.register(ChatThreadParticipant)
admin.site.register(Message)
admin.site.register(MessageMention)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "category", "title", "is_read", "created_at")
    list_filter = ("category", "is_read")
