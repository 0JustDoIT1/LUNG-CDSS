from rag.medgemma_client import call_medgemma


def main():
    prompt = """
다음 질문에 한 문단으로 답하세요.

KRAS 유전자 변이 가능성이 WSI 기반 AI 모델에서 높게 예측되었습니다.
이 결과를 임상적으로 어떻게 해석해야 하는지 설명하세요.

검색 근거는 아직 제공되지 않았으므로 치료제를 확정적으로 추천하지 마세요.
"""

    print("MedGemma 호출을 시작합니다.")
    result = call_medgemma(
        prompt=prompt,
        max_tokens=400,
        temperature=0.1,
    )

    print("\n===== MedGemma 응답 =====")
    print(result)


if __name__ == "__main__":
    main()
