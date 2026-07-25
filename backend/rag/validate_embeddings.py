import json
from pathlib import Path


RAG_DIR = Path(__file__).resolve().parent
EMBEDDED_PATH = RAG_DIR / "embedded_chunks.json"


def main():
    with EMBEDDED_PATH.open("r", encoding="utf-8") as file:
        chunks = json.load(file)

    if not chunks:
        raise ValueError("임베딩된 청크가 없습니다.")

    first_chunk = chunks[0]

    print(f"전체 청크 수: {len(chunks)}개")
    print(f"첫 번째 청크 필드: {list(first_chunk.keys())}")

    missing_embeddings = [
        index
        for index, chunk in enumerate(chunks)
        if not chunk.get("embedding")
    ]

    if missing_embeddings:
        raise ValueError(
            f"임베딩이 없는 청크가 있습니다: {missing_embeddings[:10]}"
        )

    dimensions = {
        len(chunk["embedding"])
        for chunk in chunks
    }

    print(f"임베딩 차원 종류: {dimensions}")

    if len(dimensions) != 1:
        raise ValueError(
            "청크별 임베딩 벡터 길이가 서로 다릅니다."
        )

    print(f"임베딩 벡터 차원: {next(iter(dimensions))}")
    print("모든 청크의 임베딩이 정상입니다.")


if __name__ == "__main__":
    main()