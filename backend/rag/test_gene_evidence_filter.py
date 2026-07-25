from rag.search_faiss import search


GENE_SEARCH_QUERIES = {
    "TP53": (
        "TP53 mutation non-small cell lung cancer clinical significance "
        "prognosis immunotherapy response"
    ),
    "KEAP1": (
        "KEAP1 mutation non-small cell lung cancer clinical significance "
        "prognosis immunotherapy response"
    ),
}


OTHER_GENES = {
    "TP53": ["KRAS", "KEAP1", "STK11"],
    "KEAP1": ["KRAS", "TP53", "STK11"],
}


def find_other_genes(
    target_gene: str,
    text: str,
) -> list:
    """검색 청크에서 대상 유전자 외의 다른 유전자명을 찾습니다."""
    upper_text = text.upper()

    return [
        gene
        for gene in OTHER_GENES[target_gene]
        if gene in upper_text
    ]


def classify_evidence(
    target_gene: str,
    text: str,
) -> str:
    """청크가 단독 유전자 근거인지 동시변이 중심 근거인지 임시 분류합니다."""
    upper_text = text.upper()

    if target_gene not in upper_text:
        return "제외 후보: 대상 유전자 미포함"

    other_genes = find_other_genes(
        target_gene=target_gene,
        text=text,
    )

    if other_genes:
        return (
            "검토 필요: 다른 유전자 동시 언급 "
            f"({', '.join(other_genes)})"
        )

    return "유지 후보: 대상 유전자 단독 언급"


def print_gene_search_results(
    gene: str,
    top_k: int = 10,
) -> None:
    query = GENE_SEARCH_QUERIES[gene]
    results = search(
        query,
        top_k=top_k,
    )

    print("\n" + "=" * 90)
    print(f"{gene} 검색 결과")
    print(f"검색문: {query}")
    print("=" * 90)

    for rank, result in enumerate(results, start=1):
        text = result["text"]
        classification = classify_evidence(
            target_gene=gene,
            text=text,
        )

        print(f"\n[{rank}] {classification}")
        print(f"출처: {result['source']}")
        print(f"청크 번호: {result['chunk_index']}")
        print(f"유사도 점수: {result['score']:.4f}")
        print(
            "함께 언급된 유전자:",
            ", ".join(find_other_genes(gene, text)) or "없음",
        )
        print("-" * 90)
        print(text)
        print("-" * 90)


def main():
    print_gene_search_results(
        gene="TP53",
        top_k=10,
    )

    print_gene_search_results(
        gene="KEAP1",
        top_k=10,
    )


if __name__ == "__main__":
    main()