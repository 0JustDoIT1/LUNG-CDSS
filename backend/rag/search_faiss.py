import json
import os
from pathlib import Path

import faiss
import numpy as np
from dotenv import load_dotenv
from openai import OpenAI
from rag.exceptions import EmbeddingError, SearchIndexError


load_dotenv()

RAG_DIR = Path(__file__).resolve().parent
INDEX_PATH = RAG_DIR / "faiss.index"
METADATA_PATH = RAG_DIR / "faiss_metadata.json"

EMBEDDING_MODEL = "text-embedding-3-small"
TOP_K = 5

client = None


def get_openai_client():
    """Create the OpenAI client only when an embedding is requested."""
    global client

    if client is not None:
        return client

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise EmbeddingError(
            "OPENAI_API_KEY가 설정되지 않아 검색어 임베딩을 생성할 수 없습니다."
        )

    client = OpenAI(api_key=api_key)
    return client


def load_resources():
    try:
        index = faiss.read_index(str(INDEX_PATH))
    except Exception as error:
        raise SearchIndexError(
            f"FAISS 인덱스 파일을 불러오지 못했습니다: {INDEX_PATH}"
        ) from error

    try:
        with METADATA_PATH.open("r", encoding="utf-8") as file:
            metadata = json.load(file)
    except FileNotFoundError as error:
        raise SearchIndexError(
            f"FAISS 메타데이터 파일이 없습니다: {METADATA_PATH}"
        ) from error
    except json.JSONDecodeError as error:
        raise SearchIndexError(
            f"FAISS 메타데이터 파일 형식이 잘못되었습니다: {METADATA_PATH}"
        ) from error

    return index, metadata


def embed_query(query):
    try:
        openai_client = get_openai_client()
        response = openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=query,
        )
    except EmbeddingError:
        raise
    except Exception as error:
        raise EmbeddingError(
            f"검색어 임베딩 생성에 실패했습니다: {error}"
        ) from error

    query_vector = np.array(
        [response.data[0].embedding],
        dtype=np.float32,
    )

    faiss.normalize_L2(query_vector)

    return query_vector


def search(query, top_k=TOP_K):
    index, metadata = load_resources()
    query_vector = embed_query(query)

    scores, indices = index.search(query_vector, top_k)

    results = []

    for score, index_number in zip(scores[0], indices[0]):
        if index_number == -1:
            continue

        chunk = metadata[index_number]

        results.append(
            {
                "score": float(score),
                "source": chunk["source"],
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
            }
        )

    return results


def main():
    query = input("검색어를 입력하세요: ").strip()

    if not query:
        raise ValueError("검색어가 비어 있습니다.")

    results = search(query)

    print(f"\n검색 결과: {len(results)}개")

    for rank, result in enumerate(results, start=1):
        print("\n" + "=" * 80)
        print(f"순위: {rank}")
        print(f"유사도 점수: {result['score']:.4f}")
        print(f"출처: {result['source']}")
        print(f"청크 번호: {result['chunk_index']}")
        print("-" * 80)
        print(result["text"][:1000])


if __name__ == "__main__":
    main()
