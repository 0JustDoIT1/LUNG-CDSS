# 🫁 Lung CDSS

> WSI 기반 폐암 아형(LUAD/LUSC) 분류 및 진단 보조 시스템

AMD-MIL + UNI2-h 조합으로 병리 슬라이드를 분석해 분류 결과, 히트맵, 세포 형태 소견, 유전자 변이 가능성까지 한 번에 제공하는 CDSS(Clinical Decision Support System) 웹 서비스입니다.

🔗 **Live**: https://lung-cdss.kro.kr

---

## ✨ What it does

| 기능                  | 설명                                     |
| --------------------- | ---------------------------------------- |
| 🔬 분류               | LUAD / LUSC 확률 예측                    |
| 🗺️ 히트맵             | 어텐션 기반 판단 근거 시각화             |
| 🧫 세포 형태 소견     | scikit-image 기반 핵 형태계측 + 오버레이 |
| 🧬 유전자 변이 가능성 | EGFR 등 driver gene 예측 (확장 중)       |
| 💊 표적치료 추천      | RAG 기반 가이드라인 요약                 |
| ✅ 검토/승인          | AI 제안 → 의사 확인 워크플로우           |

---

## 🏗 Architecture

```
Browser
   │ HTTPS
   ▼
┌─────────────────────────────┐
│  VM (Compute Engine)        │
│  nginx → React + Django + PG │
└───────────┬─────────────────┘
            │ authenticated request
            ▼
┌─────────────────────────────┐
│  Cloud Run (GPU · L4)       │
│  mosec — AMD-MIL + UNI2-h    │
└───────────┬─────────────────┘
            ▼
          GCS (models / uploads / reports)
```

CI/CD는 두 갈래로 분기됩니다. `frontend/`, `backend/`, `infra/` 변경 → VM 배포, `mosec-serving/` 변경 → Cloud Run 배포. 저장소는 하나, push 한 번이면 끝.

---

## 🧰 Stack

| Layer         | Tech                                                           |
| ------------- | -------------------------------------------------------------- |
| Frontend      | React · Vite · TypeScript · Tailwind CSS                       |
| Backend       | Django · Django REST Framework                                 |
| DB            | PostgreSQL                                                     |
| Model Serving | mosec (Rust 기반 서빙 엔진)                                    |
| Model         | AMD-MIL + UNI2-h (ViT-H/14 병리 파운데이션 모델)               |
| Infra         | GCP (Compute Engine · Cloud Run GPU · GCS · Artifact Registry) |
| CI/CD         | GitHub Actions                                                 |

---

## 📁 Repo Structure

```
lung-cdss/
├── frontend/          # React + Vite + TS
│   └── src/
│       ├── pages/       # 라우트 단위 페이지
│       ├── components/  # 재사용 UI
│       ├── layouts/     # 공통 레이아웃
│       ├── routes/      # 라우팅 설정
│       ├── api/         # Django API 호출
│       ├── hooks/       # 커스텀 훅
│       └── types/       # 타입 정의
│
├── backend/            # Django REST API
│   ├── config/          # 프로젝트 설정
│   └── cases/            # 케이스 모델·API
│
├── mosec-serving/       # 모델 서빙 (mosec)
│
└── infra/                # docker-compose, nginx, CI/CD 워크플로우
```

---

## 🚀 Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev        # localhost:5173
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
python manage.py runserver      # localhost:8000
```

### mosec (모델 로직만 로컬 검증, 실제 서빙은 Cloud Run)

```bash
cd mosec-serving
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt   # mosec 자체는 Windows 미지원, Docker 빌드로 검증
```

> `.env.example`을 참고해 각 폴더에 `.env`를 채워주세요. 실제 값은 Slack/노션 등 별도 채널로 공유됩니다.

---

## 🌐 API

| Method   | Endpoint                  | 설명                   |
| -------- | ------------------------- | ---------------------- |
| `GET`    | `/api/cases/`             | 목록 조회 (검색/필터)  |
| `POST`   | `/api/cases/`             | 케이스 생성            |
| `GET`    | `/api/cases/:id/`         | 상세 조회              |
| `DELETE` | `/api/cases/:id/`         | 삭제                   |
| `POST`   | `/api/cases/:id/predict/` | 분석 요청 (mosec 호출) |
| `POST`   | `/api/cases/:id/retry/`   | 재처리                 |

---

## 🔀 Branch & PR

- `main` 브랜치는 보호되어 있습니다. 직접 push 대신 **기능별 브랜치 → PR**로 작업해주세요.
- 브랜치명 예시: `feat/upload-page`, `fix/db-connection`

```bash
git checkout -b feat/your-feature
git add .
git commit -m "feat: 케이스 목록 필터 추가"
git push origin feat/your-feature
```

---

## 🔒 Secrets

민감한 값은 절대 커밋 금지 — `.env`, `hf_token.txt`, `*.pt` 등은 이미 `.gitignore`에 등록되어 있습니다. 배포용 시크릿은 GitHub Secrets에서 관리됩니다.

---

## 🛠 Ops (서버 배포 관리자 전용)

일반 개발 작업에는 필요 없습니다. VM 상태를 직접 관리하는 담당자만 참고하세요.

**VM 정지 (하루 마무리, 비용 절감)**

```bash
gcloud compute instances stop lung-cdss-vm --zone=us-central1-a
```

**VM 재시작**

```bash
gcloud compute instances start lung-cdss-vm --zone=us-central1-a
```

`restart: unless-stopped`가 걸려있어 VM이 켜지면 컨테이너(nginx·frontend·backend)는 자동으로 다시 뜹니다. `docker compose up`을 따로 실행할 필요는 없습니다.

**VM 컨테이너 상태 확인**

```bash
gcloud compute ssh lung-cdss-vm --zone=us-central1-a --command="docker ps"
```

**VM 로그 확인**

```bash
gcloud compute ssh lung-cdss-vm --zone=us-central1-a --command="cd ~/lung-cdss/infra && docker compose logs -f"
```

**참고**: 고정 IP·도메인·SSL은 VM을 정지해도 유지됩니다. 다만 정지 상태에서도 디스크·고정 IP는 소액 과금되니 완전히 안 쓸 땐 완전 삭제를 고려하세요. mosec(Cloud Run)은 `min-instances=0`이라 별도 관리 불필요합니다.

---

## 📌 Status

```
✅ 인프라 (VM · Cloud Run · CI/CD · SSL)
✅ Django API + mosec 연동
✅ mosec 파이프라인 (분류 · 히트맵 · 세포 형태)
🚧 React 페이지 구현
🚧 유전자 변이 예측 헤드
🚧 RAG 표적치료 추천
```
