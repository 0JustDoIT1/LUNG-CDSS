import fitz  # PyMuPDF
import json
import os

DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "documents")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "chunks.json")

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150


def extract_text_from_pdf(pdf_path):
    """PDF 파일 하나에서 전체 텍스트를 뽑아옵니다."""
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()
    return full_text


def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """긴 텍스트를 겹치게 잘라서 리스트로 반환합니다."""
    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk.strip())
        # 다음 시작점은 overlap만큼 뒤로 당겨서 겹치게 만듦
        start += chunk_size - overlap

    return [c for c in chunks if c]  # 빈 청크는 제외


def main():
    all_chunks = []

    pdf_files = sorted([
        f for f in os.listdir(DOCUMENTS_DIR) if f.endswith(".pdf")
    ])

    for filename in pdf_files:
        pdf_path = os.path.join(DOCUMENTS_DIR, filename)
        print(f"처리 중: {filename}")

        text = extract_text_from_pdf(pdf_path)
        chunks = chunk_text(text)

        for i, chunk in enumerate(chunks):
            all_chunks.append({
                "source": filename,
                "chunk_index": i,
                "text": chunk,
            })

        print(f"  -> {len(chunks)}개 청크 생성")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)

    print(f"\n총 {len(all_chunks)}개 청크를 {OUTPUT_PATH}에 저장했습니다.")


if __name__ == "__main__":
    main()