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

## 🧰 Stack

| Layer         | Tech                                             |
| ------------- | ------------------------------------------------ |
| Frontend      | React · Vite · TypeScript · Tailwind CSS         |
| Backend       | Django · Django REST Framework                   |
| DB            | PostgreSQL                                       |
| Model Serving | mosec (Rust 기반 서빙 엔진)                      |
| Model         | AMD-MIL + UNI2-h (ViT-H/14 병리 파운데이션 모델) |

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

> `.env.local`을 참고해 각 폴더에 `.env`를 채워주세요 (`cp backend/.env.local backend/.env` 후 값 채우기). 실제 값은 Slack/노션 등 별도 채널로 공유됩니다.

### DB 관련 참고

- PostgreSQL은 **로컬에 설치할 필요 없습니다.** 모든 팀원이 VM에 떠 있는 공용 DB(`.env`의 `DB_HOST`)를 함께 씁니다.
- `python manage.py migrate`는 **모델을 새로 바꿔서 마이그레이션 파일을 만든 사람만** 1회 실행하면 됩니다. 공용 DB에 바로 반영되니, 그 마이그레이션 파일을 `git pull`로 받은 다른 팀원은 다시 실행할 필요가 없습니다.

---

## 🌐 API

| Method   | Endpoint                  | 설명                                |
| -------- | ------------------------- | ----------------------------------- |
| `POST`   | `/api/auth/signup/`       | 회원가입                            |
| `POST`   | `/api/auth/login/`        | 로그인 (access + refresh 토큰 반환) |
| `POST`   | `/api/auth/refresh/`      | access 토큰 갱신                    |
| `GET`    | `/api/cases/`             | 목록 조회 (검색/필터)               |
| `POST`   | `/api/cases/`             | 케이스 생성                         |
| `GET`    | `/api/cases/:id/`         | 상세 조회                           |
| `DELETE` | `/api/cases/:id/`         | 삭제                                |
| `POST`   | `/api/cases/:id/predict/` | 분석 요청 (mosec 호출)              |
| `POST`   | `/api/cases/:id/retry/`   | 재처리                              |
| `POST`   | `/api/cases/:id/review/`  | 승인/수정 (AI 제안 → 의사 확인)     |

로그인 이후 요청은 헤더에 `Authorization: Bearer <access_token>`을 포함해야 합니다.

---

## 🔀 Branch & PR

- `main` 브랜치는 배포 전용입니다. 직접 push 금지.
- `dev`는 팀 작업 기준 브랜치입니다. 각자 이름 브랜치에서 작업 후 PR로 `dev`에 병합합니다.
- 브랜치명은 이름 약자로 미리 만들어져 있습니다 (예: `hbc`, `jch`, `jgy`, `lsb`).

### 처음 작업 시작할 때 (로컬에 브랜치가 없는 경우)

```bash
git fetch origin
git checkout -b 본인브랜치명 origin/본인브랜치명
```

### 이후 작업 시작할 때

```bash
git fetch origin
git checkout 본인브랜치명
git merge origin/dev
```

### 작업 완료 후

```bash
git add .
git commit -m "feat: 케이스 목록 필터 추가"
git push origin 본인브랜치명
```

→ GitHub에서 PR 생성 (`dev` ← `본인브랜치명`)
→ 팀장이 리뷰 후 `dev`로 merge

**규칙 2가지**

1. 브랜치를 오래 들고 있지 말고, 하루 단위로라도 짧게 PR 올리기 (충돌 예방)
2. 되도록 본인 담당 페이지/파일만 수정하기

**PR이 처음이라면**: `git push` 후 GitHub 저장소 페이지에 뜨는 **Compare & pull request** 버튼을 누르고, base가 `dev`인지 확인 후 생성하면 끝입니다. merge는 직접 하지 마세요.

---

## 🔒 Secrets

민감한 값은 절대 커밋 금지 — `.env`, `hf_token.txt`, `*.pt`, `local-dev-key.json` 등은 이미 `.gitignore`에 등록되어 있습니다. 필요한 값은 Slack/노션 등 별도 채널로 전달받으세요.

---

---

# 🛠 서버 배포 관리자 전용

아래 내용은 인프라/배포를 직접 관리하는 담당자만 알면 되는 내용입니다. 일반 기능 개발에는 필요 없습니다.

## Architecture

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

CI/CD는 두 갈래로 분기됩니다. `frontend/`, `backend/`, `infra/` 변경 → VM 배포, `mosec-serving/` 변경 → Cloud Run 배포. 저장소는 하나, `main`에 push 한 번이면 끝.

## Infra

GCP (Compute Engine · Cloud Run GPU · GCS · Artifact Registry) + GitHub Actions

## mosec (모델 로직만 로컬 검증, 실제 서빙은 Cloud Run)

```bash
cd mosec-serving
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt   # mosec 자체는 Windows 미지원, Docker 빌드로 검증
```

## mosec 호출 인증 (로컬에서 predict 직접 테스트할 때)

mosec Cloud Run은 비공개(인증 필요) 서비스라, 로컬 Django가 이를 호출하려면 GCP 인증 정보가 필요합니다.

1. `gcloud iam service-accounts keys create backend/local-dev-key.json --iam-account=github-actions-deployer@shining-lamp-492601-f9.iam.gserviceaccount.com`
2. `backend/.env`에 추가:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./local-dev-key.json
   ```
3. 필요한 팀원에게만 채널로 전달 (커밋 금지, `.gitignore`로 이미 보호됨)

## Ops — VM 관리

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

**PostgreSQL 컨테이너(`lung-cdss-postgres`)는 docker-compose 밖에서 별도 관리됩니다**

`docker-compose.yml`에 포함되어 있지 않고 `docker run`으로 직접 띄운 컨테이너입니다. `--restart unless-stopped`가 걸려있어 VM 재시작 시 보통 자동으로 같이 뜨지만, 혹시 안 떠 있다면:

```bash
gcloud compute ssh lung-cdss-vm --zone=us-central1-a --command="docker start lung-cdss-postgres"
```

VM을 새로 만들어야 하는 상황이라면(예: 존 리소스 부족으로 재생성 등), 아래 명령으로 다시 생성:

```bash
docker run --name lung-cdss-postgres \
  -e POSTGRES_DB=lung_cdss \
  -e POSTGRES_USER=<DB_USER> \
  -e POSTGRES_PASSWORD=<DB_PASSWORD> \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  -d postgres:16
```

**VM 시작 시 `ZONE_RESOURCE_POOL_EXHAUSTED` 에러가 나는 경우**

특정 존의 일시적 하드웨어 재고 부족입니다. 프로젝트 설정 문제가 아닙니다. 잠시 후 재시도하거나, 급하면 임시로 머신 타입을 올려서 시작 후 나중에 되돌립니다.

```bash
gcloud compute instances set-machine-type lung-cdss-vm --zone=us-central1-a --machine-type=e2-medium
gcloud compute instances start lung-cdss-vm --zone=us-central1-a
```

---

## 📌 Status

```
✅ 인프라 (VM · Cloud Run · CI/CD · SSL)
✅ Django API + mosec 연동
✅ mosec 파이프라인 (분류 · 히트맵 · 세포 형태)
🚧 React 페이지 구현
🚧 JWT 인증 / 승인 API
🚧 유전자 변이 예측 헤드
🚧 RAG 표적치료 추천
```
