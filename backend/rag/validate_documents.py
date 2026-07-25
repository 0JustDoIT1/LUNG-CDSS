import json
from pathlib import Path


RAG_DIR = Path(__file__).resolve().parent
DOCUMENTS_DIR = RAG_DIR / "documents"
METADATA_PATH = RAG_DIR / "document_metadata.json"


def main():
    if not METADATA_PATH.exists():
        raise FileNotFoundError(
            f"메타데이터 파일이 없습니다: {METADATA_PATH}"
        )

    with METADATA_PATH.open("r", encoding="utf-8") as file:
        metadata_list = json.load(file)

    print(f"메타데이터 문서 수: {len(metadata_list)}개")

    missing_files = []

    for metadata in metadata_list:
        file_name = metadata["file_name"]
        pdf_path = DOCUMENTS_DIR / file_name

        if pdf_path.exists():
            print(f"[정상] {file_name}")
        else:
            print(f"[누락] {file_name}")
            missing_files.append(file_name)

    if missing_files:
        raise FileNotFoundError(
            f"누락된 PDF 파일: {missing_files}"
        )

    print("\nPDF 파일과 메타데이터 연결이 모두 정상입니다.")


if __name__ == "__main__":
    main()