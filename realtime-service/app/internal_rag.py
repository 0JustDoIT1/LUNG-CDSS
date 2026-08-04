"""
Genkit(Node.js)은 FAISS 인덱스에 직접 접근 못 하므로(파이썬 전용, OpenAI
임베딩으로 구축됨), 이 내부 엔드포인트를 통해서만 검색한다.
외부 노출 안 됨 — nginx가 /internal/ 경로를 프록시하지 않도록 해야 함.
"""

import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

_here = Path(__file__).resolve()
for _candidate in (_here.parents[2] / "backend", _here.parents[1] / "backend"):
    if _candidate.exists():
        sys.path.insert(0, str(_candidate))
        break

router = APIRouter()


@router.post("/internal/rag/search")
async def rag_search(payload: dict):
    query = payload.get("query", "").strip()
    top_k = payload.get("top_k", 3)
    if not query:
        raise HTTPException(status_code=400, detail="query는 필수입니다")

    try:
        from rag.search_faiss import search
        results = search(query, top_k=top_k)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"검색 실패: {e}")

    return {
        "chunks": [{"text": r["text"], "source": r.get("source", "문서")} for r in results],
    }
