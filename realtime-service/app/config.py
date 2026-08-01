import os

DJANGO_INTERNAL_BASE_URL = os.environ.get("DJANGO_INTERNAL_BASE_URL", "http://backend:8000")
REDIS_CHAT_URL = os.environ.get("REDIS_CHAT_URL", "redis://redis:6379/2")  # 0=celery, 1=cache, 2=채팅Pub/Sub
