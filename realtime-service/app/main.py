from fastapi import FastAPI

from . import chat, internal_rag

app = FastAPI(title="LUNG-CDSS Realtime Service", version="0.2.0")

app.include_router(chat.router)
app.include_router(internal_rag.router)  # genkit-service의 일반지식 tool이 호출


@app.get("/health")
async def health():
    return {"status": "ok"}
