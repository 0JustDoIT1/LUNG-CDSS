class RAGServiceError(Exception):
    """RAG 처리 과정에서 발생하는 모든 에러의 기본 클래스입니다."""


class InvalidPredictionError(RAGServiceError):
    """유전자 예측값(predictions)이 올바르지 않을 때 발생합니다."""


class EmbeddingError(RAGServiceError):
    """OpenAI 임베딩 호출이 실패했을 때 발생합니다."""


class SearchIndexError(RAGServiceError):
    """FAISS 인덱스 파일을 불러오는 데 실패했을 때 발생합니다."""


class MedGemmaError(RAGServiceError):
    """MedGemma(treatment-serving) 호출이 실패했을 때 발생합니다."""