import json
import os
import time
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

RAG_DIR = os.path.dirname(__file__)
CHUNKS_PATH = os.path.join(RAG_DIR, "chunks.json")
OUTPUT_PATH = os.path.join(RAG_DIR, "embedded_chunks.json")

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100  # 한 번에 OpenAI로 보낼 텍스트 개수

client = OpenAI()  # .env의 OPENAI_API_KEY를 자동으로 읽습니다


def load_chunks():
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_embeddings_batch(texts):
    """텍스트 리스트를 한 번에 OpenAI로 보내서 벡터 리스트를 받아옵니다."""
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]


def main():
    chunks = load_chunks()
    total = len(chunks)
    print(f"총 {total}개 청크를 임베딩합니다.")

    for i in range(0, total, BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        texts = [c["text"] for c in batch]

        embeddings = get_embeddings_batch(texts)

        for chunk, embedding in zip(batch, embeddings):
            chunk["embedding"] = embedding

        print(f"  {min(i + BATCH_SIZE, total)}/{total} 완료")
        time.sleep(0.5)  # API 요청 사이 살짝 쉬어줌

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False)

    print(f"\n임베딩 완료. {OUTPUT_PATH}에 저장했습니다.")


if __name__ == "__main__":
    main()