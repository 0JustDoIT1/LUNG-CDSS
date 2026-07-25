import json
from pathlib import Path

import faiss
import numpy as np


RAG_DIR = Path(__file__).resolve().parent
EMBEDDED_PATH = RAG_DIR / "embedded_chunks.json"
INDEX_PATH = RAG_DIR / "faiss.index"
METADATA_PATH = RAG_DIR / "faiss_metadata.json"


def main():
    with EMBEDDED_PATH.open("r", encoding="utf-8") as file:
        chunks = json.load(file)

    if not chunks:
        raise ValueError("임베딩된 청크가 없습니다.")

    embeddings = np.array(
        [chunk["embedding"] for chunk in chunks],
        dtype=np.float32,
    )

    faiss.normalize_L2(embeddings)

    dimension = embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)

    faiss.write_index(index, str(INDEX_PATH))

    metadata = []

    for chunk in chunks:
        metadata.append(
            {
                "source": chunk["source"],
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
            }
        )

    with METADATA_PATH.open("w", encoding="utf-8") as file:
        json.dump(metadata, file, ensure_ascii=False)

    print(f"FAISS 인덱스 생성 완료: {INDEX_PATH}")
    print(f"메타데이터 저장 완료: {METADATA_PATH}")
    print(f"등록된 벡터 수: {index.ntotal}")
    print(f"벡터 차원: {dimension}")


if __name__ == "__main__":
    main()