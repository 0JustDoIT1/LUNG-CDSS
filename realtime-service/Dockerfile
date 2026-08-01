# 빌드 컨텍스트는 repo 루트여야 함 (docker-compose.yml에서 context: .. 로 지정)
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

COPY realtime-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# rag/ 모듈(FAISS 검색 + MedGemma 호출)을 backend에서 그대로 가져와 재사용
COPY backend/rag ./backend/rag

COPY realtime-service/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
