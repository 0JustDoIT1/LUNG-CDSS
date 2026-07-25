import time

from rag.medgemma_client import call_medgemma
from rag.search_faiss import search
from rag.exceptions import InvalidPredictionError


GENE_THRESHOLDS = {
    "TP53": 0.6626,
    "KEAP1": 0.0956,
    "KRAS": 0.1453,
}


GENE_SEARCH_QUERIES = {
    "TP53": (
        "TP53 mutation non-small cell lung cancer clinical significance "
        "prognosis immunotherapy response molecular confirmation"
    ),
    "KEAP1": (
        "KEAP1 mutation non-small cell lung cancer clinical significance "
        "prognosis immunotherapy response molecular confirmation"
    ),
    "KRAS": (
        "KRAS mutation non-small cell lung cancer clinical significance "
        "KRAS G12C targeted therapy FDA molecular confirmation"
    ),
}

FDA_DRUG_SOURCE_MAP = {
    "04_LUMAKRAS_sotorasib_FDA_label.pdf": "Sotorasib",
    "05_KRAZATI_adagrasib_FDA_label.pdf": "Adagrasib",
}


# 검색 문서에서 함께 확인할 유전자
CONTEXT_GENES = {
    "TP53",
    "KEAP1",
    "KRAS",
    "STK11",
}


def classify_gene_predictions(predictions: dict) -> list:
    """유전자별 예측 확률을 최적 threshold와 비교합니다."""
    if not isinstance(predictions, dict):
        raise InvalidPredictionError(
            f"predictions는 dict여야 합니다. 받은 타입: {type(predictions)}"
        )

    results = []

    for gene, threshold in GENE_THRESHOLDS.items():
        if gene not in predictions:
            raise InvalidPredictionError(
                f"predictions에 '{gene}' 값이 없습니다."
            )

        raw_value = predictions[gene]

        try:
            probability = float(raw_value)
        except (TypeError, ValueError) as error:
            raise InvalidPredictionError(
                f"'{gene}' 값이 숫자가 아닙니다: {raw_value!r}"
            ) from error

        if not (0.0 <= probability <= 1.0):
            raise InvalidPredictionError(
                f"'{gene}' 값은 0~1 사이여야 합니다. 받은 값: {probability}"
            )

        results.append(
            {
                "gene": gene,
                "probability": probability,
                "threshold": threshold,
                "predicted_positive": probability >= threshold,
            }
        )

    return results


def get_positive_gene_names(gene_results: list) -> list:
    """Threshold 이상으로 예측된 유전자명만 반환합니다."""
    return [
        result["gene"]
        for result in gene_results
        if result["predicted_positive"]
    ]


def format_prediction_summary(gene_results: list) -> str:
    """AI 예측 결과 요약을 코드에서 고정 생성합니다."""
    positive_genes = [
        result["gene"]
        for result in gene_results
        if result["predicted_positive"]
    ]

    negative_genes = [
        result["gene"]
        for result in gene_results
        if not result["predicted_positive"]
    ]

    lines = []

    if positive_genes:
        lines.append(
            f"{', '.join(positive_genes)} 유전자 변이 가능성이 "
            "높게 예측되었습니다."
        )
    else:
        lines.append(
            "높은 변이 가능성으로 예측된 유전자는 없습니다."
        )

    if negative_genes:
        lines.append(
            f"{', '.join(negative_genes)} 유전자 변이 가능성은 "
            "낮게 예측되었습니다."
        )

    return " ".join(lines)


def limit_results_per_source(
    search_results: list,
    max_per_source: int = 2,
    final_top_k: int = 5,
) -> list:
    """같은 PDF의 검색 결과가 과도하게 반복되지 않도록 제한합니다."""
    selected_results = []
    source_counts = {}

    for result in search_results:
        source = result["source"]
        current_count = source_counts.get(source, 0)

        if current_count >= max_per_source:
            continue

        selected_results.append(result)
        source_counts[source] = current_count + 1

        if len(selected_results) >= final_top_k:
            break

    return selected_results


def find_mentioned_genes(
    target_gene: str,
    text: str,
) -> list:
    """검색 청크에서 대상 유전자 외에 함께 언급된 유전자를 찾습니다."""
    upper_text = text.upper()

    return sorted(
        gene
        for gene in CONTEXT_GENES
        if gene != target_gene and gene in upper_text
    )


def classify_search_result(
    target_gene: str,
    result: dict,
) -> dict:
    """
    검색 근거를 다음 세 종류로 분류합니다.

    direct:
        대상 유전자만 직접 다루는 근거

    co_mutation:
        대상 유전자와 다른 유전자를 함께 다루는 근거

    excluded:
        대상 유전자가 본문에 없는 근거
    """
    classified_result = result.copy()
    text = result["text"]
    upper_text = text.upper()

    classified_result["target_gene"] = target_gene
    classified_result["mentioned_genes"] = []

    if target_gene not in upper_text:
        classified_result["evidence_type"] = "excluded"
        classified_result["used_for_generation"] = False
        return classified_result

    mentioned_genes = find_mentioned_genes(
        target_gene=target_gene,
        text=text,
    )

    classified_result["mentioned_genes"] = mentioned_genes

    if mentioned_genes:
        classified_result["evidence_type"] = "co_mutation"
        classified_result["used_for_generation"] = False
    else:
        classified_result["evidence_type"] = "direct"
        classified_result["used_for_generation"] = True

    return classified_result


def search_evidence_by_gene(
    positive_genes: list,
    top_k_per_gene: int = 3,
) -> dict:
    """
    예측 양성 유전자별로 근거를 검색하고,
    직접 근거와 동시변이 근거를 구분합니다.
    """
    evidence_by_gene = {}

    for gene in positive_genes:
        query = GENE_SEARCH_QUERIES[gene]

        raw_results = search(
            query,
            top_k=top_k_per_gene * 5,
        )

        limited_results = limit_results_per_source(
            raw_results,
            max_per_source=10,
            final_top_k=top_k_per_gene * 5,
        )

        direct_results = []
        co_mutation_results = []
        excluded_results = []

        for result in limited_results:
            classified_result = classify_search_result(
                target_gene=gene,
                result=result,
            )

            evidence_type = classified_result["evidence_type"]

            if evidence_type == "direct":
                direct_results.append(classified_result)
            elif evidence_type == "co_mutation":
                co_mutation_results.append(classified_result)
            else:
                excluded_results.append(classified_result)

        evidence_by_gene[gene] = {
            "query": query,
            "direct": direct_results[:top_k_per_gene],
            "co_mutation": co_mutation_results[:top_k_per_gene],
            "excluded": excluded_results[:top_k_per_gene],
        }

    return evidence_by_gene


def format_model_context(evidence_by_gene: dict) -> str:
    """
    MedGemma에는 직접 적용 가능한 근거만 전달합니다.

    직접 근거가 없으면 동시변이 원문을 전달하지 않고,
    직접 적용 가능한 근거가 부족하다는 상태만 전달합니다.
    """
    context_blocks = []

    for gene, evidence_group in evidence_by_gene.items():
        direct_results = evidence_group["direct"]
        co_mutation_results = evidence_group["co_mutation"]

        context_blocks.append(f"[{gene} 근거 상태]")

        if direct_results:
            context_blocks.append(
                f"{gene}만 직접 다루는 근거가 "
                f"{len(direct_results)}개 검색되었습니다."
            )

            for rank, result in enumerate(direct_results, start=1):
                context_blocks.append(
                    f"[{gene} 직접 근거 {rank}]\n"
                    f"출처: {result['source']}\n"
                    f"청크 번호: {result['chunk_index']}\n"
                    f"내용:\n{result['text']}"
                )

            continue

        if co_mutation_results:
            co_genes = sorted(
                {
                    mentioned_gene
                    for result in co_mutation_results
                    for mentioned_gene in result["mentioned_genes"]
                }
            )

            context_blocks.append(
                f"{gene}만 단독으로 현재 사례에 직접 적용할 수 있는 "
                "근거를 찾지 못했습니다."
            )

            context_blocks.append(
                "검색된 근거는 주로 "
                f"{', '.join(co_genes)} 유전자와의 동시변이 "
                "하위집단을 분석한 연구입니다."
            )

            context_blocks.append(
                "해당 동시변이가 분자검사로 확인되지 않았으므로 "
                "이 연구 결과를 현재 사례에 직접 적용하지 마세요."
            )

            continue

        context_blocks.append(
            f"{gene}에 대해 직접 해석할 수 있는 검색 근거를 "
            "찾지 못했습니다."
        )

    return "\n\n".join(context_blocks)


def flatten_references(evidence_by_gene: dict) -> list:
    """검색된 근거를 화면 및 API 응답용 목록으로 합칩니다."""
    references = []

    for gene, evidence_group in evidence_by_gene.items():
        for evidence_type in [
            "direct",
            "co_mutation",
            "excluded",
        ]:
            for result in evidence_group[evidence_type]:
                reference = result.copy()
                reference["gene"] = gene
                references.append(reference)

    return references


def get_allowed_fda_drugs(evidence_by_gene: dict) -> list:
    """직접 근거로 검색된 FDA 라벨에 해당하는 약물명만 반환합니다."""
    allowed_drugs = []

    kras_evidence = evidence_by_gene.get("KRAS", {})

    for result in kras_evidence.get("direct", []):
        source = result["source"]
        drug = FDA_DRUG_SOURCE_MAP.get(source)

        if drug and drug not in allowed_drugs:
            allowed_drugs.append(drug)

    return allowed_drugs


def build_non_kras_prompt(
    positive_genes: list,
    evidence_by_gene: dict,
) -> str:
    """TP53 및 KEAP1 중심 해석에 사용하는 프롬프트입니다."""
    positive_gene_text = ", ".join(positive_genes)
    context_text = format_model_context(evidence_by_gene)

    return f"""
다음은 WSI 기반 AI 모델에서 변이 가능성이 높게 예측된 유전자입니다.

[해석 대상 유전자]
{positive_gene_text}

다음은 검색 근거를 현재 사례에 적용할 수 있는지 코드에서 먼저 분류한 결과입니다.

[근거 적용 상태]
{context_text}

위 근거 적용 상태만 사용하여 의료진 검토용 소견 중
2번과 3번 항목만 작성하세요.

작성 형식:
2. 유전자별 임상적 해석
3. 치료 관련 검토사항

반드시 지킬 조건:
- 최종 답변은 한국어로 작성하세요.
- 유전자명은 영문 표기를 유지하세요.
- 해석 대상 유전자만 작성하세요.
- 1번, 4번, 5번 항목은 작성하지 마세요.
- 해석 대상에 포함되지 않은 유전자는 언급하지 마세요.
- 직접 적용 가능한 근거가 없으면 근거가 부족하다고 명시하세요.
- 동시변이 연구를 현재 사례에 직접 적용하지 마세요.
- 확인되지 않은 동시변이를 실제 변이처럼 표현하지 마세요.
- 검색 근거에 없는 치료 효과나 예후를 추정하지 마세요.
- TP53 및 KEAP1을 치료 반응 예측 지표로 단정하지 마세요.
- TP53 및 KEAP1을 단독 치료 결정 바이오마커처럼 표현하지 마세요.
- 특정 ICI, 표적치료제 또는 약물명을 작성하지 마세요.
- 환자의 치료를 확정하거나 특정 치료법을 권고하지 마세요.
- 각 항목은 핵심 내용만 1~2개 문장으로 작성하세요.
- 같은 내용을 반복하지 마세요.
- 작성 지시문을 최종 답변에 그대로 출력하지 마세요.
""".strip()


def build_interpretation_only_prompt(
    positive_genes: list,
    evidence_by_gene: dict,
) -> str:
    """KRAS와 함께 양성인 TP53/KEAP1의 2번 해석만 요청하는 프롬프트입니다."""
    positive_gene_text = ", ".join(positive_genes)
    context_text = format_model_context(evidence_by_gene)

    return f"""
다음은 WSI 기반 AI 모델에서 변이 가능성이 높게 예측된 유전자입니다.

[해석 대상 유전자]
{positive_gene_text}

다음은 검색 근거를 현재 사례에 적용할 수 있는지 코드에서 먼저 분류한 결과입니다.

[근거 적용 상태]
{context_text}

위 근거 적용 상태만 사용하여 아래 해석 대상 유전자에 대한
임상적 해석 본문만 작성하세요.

작성 형식:
- 번호나 제목("2. 유전자별 임상적 해석" 등)은 붙이지 말고,
  본문 내용만 바로 작성하세요.

반드시 지킬 조건:
- 최종 답변은 한국어로 작성하세요.
- 유전자명은 영문 표기를 유지하세요.
- 해석 대상 유전자만 작성하세요.
- 해석 대상에 포함되지 않은 유전자(KRAS 포함)는 언급하지 마세요.
- 직접 적용 가능한 근거가 없으면 근거가 부족하다고 명시하세요.
- 동시변이 연구를 현재 사례에 직접 적용하지 마세요.
- 확인되지 않은 동시변이를 실제 변이처럼 표현하지 마세요.
- 검색 근거에 없는 치료 효과나 예후를 추정하지 마세요.
- TP53 및 KEAP1을 치료 반응 예측 지표로 단정하지 마세요.
- TP53 및 KEAP1을 단독 치료 결정 바이오마커처럼 표현하지 마세요.
- 특정 ICI, 표적치료제 또는 약물명을 작성하지 마세요.
- 치료 관련 내용, 추가 검사, 주의사항은 언급하지 마세요.
- 핵심 내용만 1~2개 문장으로 작성하세요.
- 같은 내용을 반복하지 마세요.
- 작성 지시문을 최종 답변에 그대로 출력하지 마세요.
""".strip()


def build_kras_prompt(
    positive_genes: list,
    evidence_by_gene: dict,
) -> str:
    """KRAS 양성 예측이 포함된 경우 사용하는 프롬프트입니다."""
    positive_gene_text = ", ".join(positive_genes)
    context_text = format_model_context(evidence_by_gene)

    allowed_drugs = get_allowed_fda_drugs(evidence_by_gene)
    allowed_drug_text = ", ".join(allowed_drugs) if allowed_drugs else "없음"

    return f"""
다음은 WSI 기반 AI 모델에서 변이 가능성이 높게 예측된 유전자입니다.

[해석 대상 유전자]
{positive_gene_text}

[중요한 예측 범위]
이 AI 모델은 KRAS 유전자 수준의 변이 가능성을 예측합니다.
KRAS G12C와 같은 세부 변이 아형은 예측하거나 확정하지 않습니다.

다음은 검색 근거를 현재 사례에 적용할 수 있는지 코드에서 먼저 분류한 결과입니다.

[근거 적용 상태]
{context_text}

[직접 검색된 FDA 라벨 기반 허용 약물명]
{allowed_drug_text}

위 정보만 사용하여 의료진 검토용 소견 중
3번 치료 관련 검토사항만 작성하세요.

작성 형식:
3. 치료 관련 검토사항

반드시 지킬 조건:
- 최종 답변은 한국어로 작성하세요.
- 유전자명과 약물명은 영문 표기를 유지하세요.
- 1번, 4번, 5번 항목은 작성하지 마세요.
- 일반적인 KRAS 변이 가능성 예측과 KRAS G12C 확정을 명확히 구분하세요.
- WSI 기반 AI 결과만으로 KRAS G12C를 확정하지 마세요.
- KRAS G12C는 확정 분자검사를 통해 확인해야 한다고 작성하세요.
- 직접 검색된 FDA 라벨 기반 허용 약물명에 있는 약물만 작성하세요.
- 허용 약물명이 '없음'이면 특정 약물명을 작성하지 마세요.
- 약물은 KRAS G12C가 분자검사로 확인되고 FDA 라벨의 병기, 이전 치료 및 기타 적용 조건을 충족하는 경우에만 검토할 수 있다고 작성하세요.
- KRAS G12C 확인만으로 특정 약제를 자동 선택할 수 있다고 표현하지 마세요.
- 동시변이 연구를 현재 사례에 직접 적용하지 마세요.
- 확인되지 않은 TP53, KEAP1 또는 STK11 변이를 실제 동시변이처럼 표현하지 마세요.
- 환자의 병기, 치료 이력, PD-L1 및 확정 분자검사 결과가 없으므로 치료를 확정하지 마세요.
- 각 항목은 핵심 내용만 1~2개 문장으로 작성하세요.
- 같은 내용을 반복하지 마세요.
- 작성 지시문을 최종 답변에 그대로 출력하지 마세요.
- 이 시스템은 NSCLC만 다루므로 colorectal cancer, CRC 및 다른 암종의 적응증은 작성하지 마세요.
- 2번 항목은 작성하지 마세요.
- 약물이 사용 가능하다고 단정하지 말고, FDA 라벨의 NSCLC 적용 조건을 충족할 때 적용 가능성을 검토할 수 있다고 표현하세요.
""".strip()


def build_prompt(
    positive_genes: list,
    evidence_by_gene: dict,
) -> str:
    """KRAS 포함 여부에 따라 전용 프롬프트를 선택합니다."""
    if "KRAS" in positive_genes:
        return build_kras_prompt(
            positive_genes=positive_genes,
            evidence_by_gene=evidence_by_gene,
        )

    return build_non_kras_prompt(
        positive_genes=positive_genes,
        evidence_by_gene=evidence_by_gene,
    )



def kras_fixed_interpretation_text() -> str:
    """KRAS 항목의 2번 해석 본문(고정 문구, 헤더 제외)."""
    return (
        "본 AI 모델은 KRAS 유전자 수준의 변이 가능성만 예측하며, "
        "KRAS G12C와 같은 세부 변이 아형을 특정하지 않습니다."
    )


def kras_fixed_treatment_text(evidence_by_gene: dict) -> str:
    """KRAS 항목의 3번 치료 검토 본문(고정 문구, 헤더 제외)."""
    allowed_drugs = get_allowed_fda_drugs(evidence_by_gene)

    if allowed_drugs:
        drug_text = ", ".join(allowed_drugs)

        return (
            "확정 분자검사로 KRAS G12C가 확인되고, "
            "FDA 라벨에 명시된 NSCLC의 병기, 이전 치료 및 기타 적용 조건을 "
            f"충족하는 경우에 한해 {drug_text}의 적용 가능성을 "
            "의료진이 검토할 수 있습니다. "
            "현재 정보만으로 특정 약제를 선택하거나 치료를 확정할 수 없습니다."
        )

    return (
        "현재 직접 검색된 FDA 라벨 근거가 없어 특정 약물의 적용 가능성을 "
        "제시할 수 없습니다. KRAS G12C 여부와 환자의 임상 조건을 "
        "확정한 후 치료 가능성을 검토해야 합니다."
    )


def build_fixed_kras_sections(evidence_by_gene: dict) -> str:
    """KRAS만 단독 양성일 때 2번·3번을 코드에서 고정 생성합니다."""
    return (
        "2. 유전자별 임상적 해석\n\n"
        f"{kras_fixed_interpretation_text()}\n\n"
        "3. 치료 관련 검토사항\n\n"
        f"{kras_fixed_treatment_text(evidence_by_gene)}"
    )



def build_fixed_clinical_sections(
    positive_genes: list,
    evidence_by_gene: dict,
) -> str:
    """추가 검사와 주의사항을 코드에서 고정 생성합니다."""
    positive_gene_text = ", ".join(positive_genes)

    genes_without_direct_evidence = [
        gene
        for gene, evidence_group in evidence_by_gene.items()
        if not evidence_group["direct"]
    ]

    if genes_without_direct_evidence:
        evidence_warning = (
            f"현재 검색된 {', '.join(genes_without_direct_evidence)} 관련 문서는 "
            "주로 다른 유전자와의 동시변이 하위집단을 분석한 연구이므로, "
            "해당 결과를 본 사례에 직접 적용할 수 없습니다."
        )
    else:
        evidence_warning = (
            "검색된 근거는 환자의 임상정보와 확정 분자검사 결과를 "
            "함께 고려하여 해석해야 합니다."
        )

    if "KRAS" in positive_genes:
        molecular_test_text = (
            "- KRAS 변이 여부와 세부 변이 아형을 확인하기 위한 "
            "확정 분자검사가 필요합니다.\n"
            "- KRAS G12C 표적치료 적용 가능성을 검토하려면 "
            "KRAS G12C 여부와 FDA 라벨의 병기, 이전 치료 및 기타 적용 조건을 "
            "함께 확인해야 합니다."
        )

        treatment_warning = (
            "- 일반적인 KRAS 변이 가능성 예측만으로는 "
            "KRAS G12C 표적치료제를 선택할 수 없습니다."
        )
    else:
        molecular_test_text = (
            f"- {positive_gene_text} 변이 여부를 확인하기 위한 "
            "확정 분자검사가 필요합니다."
        )

        treatment_warning = (
            f"- {positive_gene_text}은 단독으로 표준 치료 또는 약제를 "
            "결정하는 근거로 사용할 수 없습니다."
        )

    return (
        "4. 추가 확인이 필요한 검사 및 임상정보\n\n"
        f"{molecular_test_text}\n"
        "- 환자의 병기, 조직학적 진단, 치료 이력, PD-L1 발현, "
        "전신 상태 및 기타 확정 분자검사 결과를 함께 확인해야 합니다.\n\n"
        "5. 주의사항\n\n"
        f"- {evidence_warning}\n"
        f"{treatment_warning}\n"
        "- WSI 기반 AI 예측은 분자검사를 대체할 수 없으며, "
        "최종 판단은 의료진의 종합적인 검토를 통해 이루어져야 합니다."
    )


def generate_treatment_note(
    predictions: dict,
    top_k_per_gene: int = 3,
) -> dict:
    """유전자 예측 결과를 바탕으로 RAG 소견을 생성합니다."""
    total_start = time.perf_counter()

    gene_results = classify_gene_predictions(predictions)
    positive_genes = get_positive_gene_names(gene_results)
    prediction_summary = format_prediction_summary(gene_results)

    search_start = time.perf_counter()

    evidence_by_gene = search_evidence_by_gene(
        positive_genes=positive_genes,
        top_k_per_gene=top_k_per_gene,
    )

    print(
        f"임베딩 및 FAISS 검색 완료: "
        f"{time.perf_counter() - search_start:.2f}초"
    )

    if positive_genes:
        non_kras_genes = [
            gene for gene in positive_genes if gene != "KRAS"
        ]

        if "KRAS" in positive_genes:
            print("KRAS 포함 사례: KRAS는 고정 문구로, 나머지 유전자는 MedGemma로 해석합니다.")

            interpretation_parts = []

            if non_kras_genes:
                non_kras_evidence = {
                    gene: evidence_by_gene[gene] for gene in non_kras_genes
                }

                prompt = build_interpretation_only_prompt(
                    positive_genes=non_kras_genes,
                    evidence_by_gene=non_kras_evidence,
                )

                medgemma_start = time.perf_counter()
                print("MedGemma 응답 생성을 시작합니다. (TP53/KEAP1 해석)")

                other_interpretation = call_medgemma(
                    prompt=prompt,
                    max_tokens=400,
                    temperature=0.0,
                )

                print(
                    f"MedGemma 호출 완료: "
                    f"{time.perf_counter() - medgemma_start:.2f}초"
                )

                interpretation_parts.append(other_interpretation.strip())

            interpretation_parts.append(kras_fixed_interpretation_text())

            generated_body = (
                "2. 유전자별 임상적 해석\n\n"
                + "\n\n".join(interpretation_parts)
                + "\n\n3. 치료 관련 검토사항\n\n"
                + kras_fixed_treatment_text(evidence_by_gene)
            )
        else:
            prompt = build_non_kras_prompt(
                positive_genes=positive_genes,
                evidence_by_gene=evidence_by_gene,
            )

            medgemma_start = time.perf_counter()
            print("MedGemma 응답 생성을 시작합니다.")

            generated_body = call_medgemma(
                prompt=prompt,
                max_tokens=500,
                temperature=0.0,
            )

            print(
                f"MedGemma 호출 완료: "
                f"{time.perf_counter() - medgemma_start:.2f}초"
            )

        fixed_sections = build_fixed_clinical_sections(
            positive_genes=positive_genes,
            evidence_by_gene=evidence_by_gene,
        )
    else:
        generated_body = (
            "2. 유전자별 임상적 해석\n\n"
            "높은 변이 가능성으로 예측된 유전자가 없어 "
            "유전자별 해석을 생성하지 않았습니다.\n\n"
            "3. 치료 관련 검토사항\n\n"
            "현재 AI 예측만으로 치료 관련 결론을 제시할 수 없습니다."
        )

        fixed_sections = (
            "4. 추가 확인이 필요한 검사 및 임상정보\n\n"
            "- 환자의 병기, 조직학적 진단, 치료 이력, PD-L1 발현, "
            "전신 상태 및 확정 분자검사 결과를 확인해야 합니다.\n\n"
            "5. 주의사항\n\n"
            "- WSI 기반 AI 예측은 분자검사를 대체할 수 없으며, "
            "최종 판단은 의료진의 종합적인 검토를 통해 이루어져야 합니다."
        )

    treatment_note = (
        "1. AI 예측 결과 요약\n\n"
        f"{prediction_summary}\n\n"
        f"{generated_body}\n\n"
        f"{fixed_sections}"
    )

    print(
        f"전체 RAG 처리 시간: "
        f"{time.perf_counter() - total_start:.2f}초"
    )

    return {
        "gene_results": gene_results,
        "positive_genes": positive_genes,
        "evidence_by_gene": evidence_by_gene,
        "references": flatten_references(evidence_by_gene),
        "treatment_note": treatment_note,
    }


def main():
    test_predictions = {
        "TP53": 0.80,
        "KEAP1": 0.05,
        "KRAS": 0.30,
    }

    print("RAG 기반 MedGemma 소견 생성을 시작합니다.")

    result = generate_treatment_note(
        predictions=test_predictions,
        top_k_per_gene=3,
    )

    print("\n===== 중점 해석 유전자 =====")
    print(", ".join(result["positive_genes"]) or "없음")

    print("\n===== 유전자별 근거 분류 =====")
    for gene, evidence_group in result["evidence_by_gene"].items():
        print(
            f"- {gene}: "
            f"직접 근거 {len(evidence_group['direct'])}개, "
            f"동시변이 근거 {len(evidence_group['co_mutation'])}개, "
            f"제외 근거 {len(evidence_group['excluded'])}개"
        )

    print("\n===== 검색된 출처 =====")
    for reference in result["references"]:
        evidence_type = reference["evidence_type"]

        if evidence_type == "direct":
            status = "직접 사용"
        elif evidence_type == "co_mutation":
            status = "동시변이 참고용"
        else:
            status = "제외"

        mentioned_genes = ", ".join(
            reference["mentioned_genes"]
        ) or "없음"

        print(
            f"- [{reference['gene']}] "
            f"[{status}] "
            f"{reference['source']} "
            f"(청크 {reference['chunk_index']}, "
            f"함께 언급: {mentioned_genes})"
        )

    print("\n===== MedGemma 의료진 검토용 소견 =====")
    print(result["treatment_note"])


if __name__ == "__main__":
    main()