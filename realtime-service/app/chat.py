"""
설계:
  1. 클라이언트가 WebSocket 연결 (ws://.../ws/chat/{thread_id}?token=<JWT>)
  2. 연결 시 Redis 채널 "chat:{thread_id}"를 구독 시작
  3. 메시지 수신 시, Django REST(/api/communication/threads/{id}/messages/)를
     내부 호출해서 저장 — @멘션 파싱, 알림발송(notify()) 로직을 Django에
     이미 구현해뒀으므로 여기서 재구현하지 않고 그대로 재사용한다.
  4. Django가 반환한 메시지를 Redis 채널에 publish
  5. 그 채널을 구독 중인 모든 FastAPI 워커가 각자의 WebSocket 클라이언트에게 전달
     (워커가 여러개 떠도 Pub/Sub로 전부 받게 되는 게 핵심 — Django Channels 없이도
     동일한 효과)
"""

import asyncio
import json

import httpx
import redis.asyncio as redis
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from .auth import require_ws_token
from .config import DJANGO_INTERNAL_BASE_URL, REDIS_CHAT_URL

router = APIRouter()


async def _get_redis() -> redis.Redis:
    return redis.from_url(REDIS_CHAT_URL, decode_responses=True)


@router.websocket("/ws/chat/{thread_id}")
async def chat_socket(websocket: WebSocket, thread_id: str, token: str = Query(...)):
    user = require_ws_token(token)  # 실패시 WebSocketException으로 자동 종료
    await websocket.accept()

    r = await _get_redis()
    pubsub = r.pubsub()
    channel = f"chat:{thread_id}"
    await pubsub.subscribe(channel)

    async def relay_from_redis():
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            await websocket.send_text(message["data"])

    relay_task = asyncio.create_task(relay_from_redis())

    try:
        async with httpx.AsyncClient(base_url=DJANGO_INTERNAL_BASE_URL, timeout=10) as client:
            while True:
                raw = await websocket.receive_text()
                payload = json.loads(raw)

                resp = await client.post(
                    f"/api/communication/threads/{thread_id}/messages/",
                    json={
                        "content": payload.get("content"),
                        "voice_url": payload.get("voice_url"),
                        "mentioned_user_ids": payload.get("mentioned_user_ids", []),
                    },
                    headers={"Authorization": f"Bearer {token}"},  # 연결시 검증된 토큰 재사용
                )

                if resp.status_code >= 400:
                    await websocket.send_text(json.dumps({"error": resp.text}))
                    continue

                await r.publish(channel, resp.text)
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await r.close()
