# LUNG-CDSS 백엔드·인프라 전체 기술 문서

> `github.com/0JustDoIT1/LUNG-CDSS` 저장소를 직접 클론해서 코드를 읽고 작성했습니다.
> 코드에 실제로 존재하는 내용만 담았고, 읽으면서 발견한 버그·리스크는 각 섹션 안에
> **⚠️ 발견된 이슈**로 표시했습니다. 전체 이슈는 문서 맨 끝 8장에 모아뒀습니다.

---

## 1. 전체 아키텍처 개요

### 1.1 저장소 구조 (모노레포, 단일 repo에 7개 서비스)

```
LUNG-CDSS/
├── backend/            Django REST API (WSGI, gunicorn) — 핵심 도메인 로직 전부
├── frontend/            React + Vite — 병리사 전용 웹 (Flutter 앱 대상 아님)
├── realtime-service/    FastAPI (ASGI) — WebSocket 실시간 채팅 릴레이
├── genkit-service/      Node.js (Express + Genkit + MCP) — AI 챗봇 오케스트레이션
├── mosec-serving/       GPU 추론 서버 (mosec) — 조직형 분류 + 유전자변이 예측
├── thumbnail-serving/   CPU 전용 mosec 서버 — 슬라이드 썸네일만 생성
├── treatment-serving/   vLLM 서버 — MedGemma-4B-it 모델 서빙
├── infra/                nginx 설정 + docker-compose.yml
└── .github/workflows/    GitHub Actions CI/CD (서비스별로 분리된 4개 워크플로우)
```

### 1.2 배포 토폴로지

```
                        ┌─────────────────────────────────────┐
                        │  GCE VM (lung-cdss.kro.kr)            │
                        │  docker compose로 아래 전부 기동       │
                        │                                       │
  브라우저/앱 ──443──▶  nginx  ──/ ────────▶ frontend (React)   │
                        │       ──/api/ ────▶ backend (Django)  │
                        │       ──/ws/ ─────▶ realtime (FastAPI)│
                        │       ──/ai/ ─────▶ genkit (Node.js)  │
                        │                                       │
                        │  backend ─┬─▶ redis (DB0=Celery       │
                        │            │        DB1=Django캐시,    │
                        │            │        DB2=채팅Pub/Sub)   │
                        │            ├─▶ celery_worker           │
                        │            └─▶ celery_beat             │
                        └─────────────────────┬─────────────────┘
                                               │
                          (VM 밖, 별도 container)│
                          PostgreSQL 34.170.97.4:5432
                                               │
                        ┌──────────────────────┴──────────────────────┐
                        │  GCP Cloud Run (us-central1, GPU 필요시만)     │
                        │  mosec-serving      (L4 GPU) — 조직형 분류    │
                        │  thumbnail-serving  (CPU)    — 썸네일        │
                        │  treatment-serving  (L4 GPU) — MedGemma RAG  │
                        └───────────────────────────────────────────────┘
```

- **병원 1곳 고정 전제** — 멀티테넌시 없음, 병리사가 React 웹에서 슬라이드 업로드하면
  그때부터 Django DB에 케이스가 생기고, Flutter 앱(환자/의료진)은 그 이후 흐름만 다룸.
- **DB는 docker-compose 안에 없음** — `infra/docker-compose.yml`의 `postgres` 서비스가
  통째로 주석처리되어 있고, 실제로는 VM 밖에 별도로 뜬 컨테이너(`34.170.97.4:5432`)를
  `.env`의 `DB_HOST`로 가리킴.
- **Django(backend)는 여전히 WSGI/gunicorn** — Django Channels는 최종적으로 채택되지 않았고,
  실시간 채팅은 별도의 FastAPI(ASGI) 서비스(`realtime-service`)가 전담. (⚠️ 아래 10장 참고 —
  과거 인수인계 문서에는 "Django Channels + Redis"로 기록되어 있으나 실제 코드와 다름.)

### 1.3 인증 토큰 공유 구조

- Django(`rest_framework_simplejwt`, HS256)가 JWT를 발급.
- `realtime-service`와 `genkit-service`는 **같은 `DJANGO_SECRET_KEY`**로 그 토큰을 직접
  검증(PyJWT)한다 — 별도 인증서버 없이 세 서비스가 토큰 하나를 공유하는 구조.
- Access 12시간 / Refresh 7일, rotation + blacklist 사용(`rest_framework_simplejwt.token_blacklist`).

---

## 2. 인프라 — nginx / docker-compose / CI-CD

### 2.1 `infra/nginx/nginx.conf`

| 경로 | 프록시 대상 | 비고 |
|---|---|---|
| `/` | `frontend:80` | React (병리사 웹) |
| `/api/` | `backend:8000/api/` | `proxy_read/connect/send_timeout 900s` — AI 추론 대기시간 고려 |
| `/ws/` | `realtime:8001/ws/` | `Upgrade`/`Connection` 헤더로 WebSocket 업그레이드, `proxy_read_timeout 3600s` |
| `/ai/` | `genkit:8002/ai/` | `proxy_read_timeout 60s` |

- 80번 포트는 443으로 강제 리다이렉트, SSL은 Let's Encrypt 인증서를 호스트에서
  볼륨마운트(`/etc/letsencrypt:/etc/letsencrypt:ro`)해서 사용.

**⚠️ 발견된 이슈 — `/admin/`, `/static/` 라우팅 없음**
`config/urls.py`에는 `path("admin/", admin.site.urls)`가 API 프리픽스(`/api/`) 밖,
루트 경로에 등록되어 있는데, 현재 `nginx.conf`에는 `/admin/`이나 `/static/`을 backend로
넘기는 location 블록이 없다. 과거 세션에서 이 문제를 한 번 고쳤다는 기록이 있으나
**현재 저장소의 nginx.conf에는 반영되어 있지 않다** — 지금 상태로는 `/admin/` 접속 시
frontend(React)의 catch-all 라우팅으로 흘러가 404가 날 가능성이 높다. 재확인 필요.

### 2.2 `infra/docker-compose.yml` — 서비스 8개

| 서비스 | 역할 | 비고 |
|---|---|---|
| `nginx` | 리버스 프록시 | 80/443 노출 |
| `frontend` | React 빌드 산출물 서빙 | |
| `backend` | Django (gunicorn) | `GOOGLE_APPLICATION_CREDENTIALS`로 GCS 키 마운트 |
| `redis` | Celery 브로커 + Django 캐시 + 채팅 Pub/Sub | DB 번호로 용도 분리(0/1/2) |
| `celery_worker` | 비동기 태스크 실행 | |
| `celery_beat` | 주기적 태스크 스케줄러 | |
| `realtime` | FastAPI, WebSocket 채팅 | `depends_on: redis, backend` |
| `genkit` | Node.js, AI 챗봇 | `depends_on: backend, realtime` |
| ~~`postgres`~~ | (주석처리됨, 미사용) | 실제 DB는 VM 밖 별도 컨테이너 |

- `backend`, `celery_worker`, `celery_beat` 세 컨테이너 모두 각각 GCS 서비스계정 키와
  Firebase Admin SDK 키를 동일하게 볼륨마운트 — Celery 태스크 안에서도 FCM 발송(`notify()`)이
  일어나므로 Firebase 크리덴셜이 필요.

### 2.3 CI/CD — 서비스별로 완전히 분리된 4개 워크플로우

| 워크플로우 | 트리거 경로(`paths`) | 배포 방식 |
|---|---|---|
| `deploy-vm.yml` | `frontend/**` `backend/**` `infra/**` `realtime-service/**` `genkit-service/**` `.github/workflows/deploy-vm.yml` | SCP로 VM에 파일 복사 → SSH로 `docker compose down && up --build -d` |
| `deploy-mosec.yml` | `mosec-serving/**` | Docker Buildx → Artifact Registry push → `gcloud run deploy mosec-serving` |
| `deploy-thumbnail.yml` | `thumbnail-serving/**` | 위와 동일 패턴, CPU 전용 |
| `deploy-treatment.yml` | `treatment-serving/**` | 위와 동일 패턴, HF 토큰 시크릿으로 모델 가중치 사전 다운로드 |

- 세 Cloud Run 배포 워크플로우 모두 `--secret id=hf_token`류의 buildx 시크릿과
  레지스트리 캐시(`--cache-from/--cache-to type=registry`)를 사용해 빌드시간을 줄임.
- `deploy-vm.yml`은 `docker compose down` 후 `up --build`라서, **배포 중 짧은 다운타임이
  발생**한다(무중단 배포 아님) — rolling 방식이 아니라 전체 스택을 내렸다 올림.

**Cloud Run 배포 파라미터 요약**

| 서비스 | GPU | min/max instances | timeout | 인증 |
|---|---|---|---|---|
| `mosec-serving` | L4 1개 | 0 / 1 | 900s | `--no-allow-unauthenticated` (ID 토큰) |
| `thumbnail-serving` | 없음(CPU) | 0 / 3 | 900s, `concurrency=1` | `--no-allow-unauthenticated` |
| `treatment-serving` | L4 1개 | 0 / 1 | **300s** | `--no-allow-unauthenticated`, startup probe `timeoutSeconds=240` |

**⚠️ 발견된 이슈 — treatment-serving 타임아웃 300s vs 실제 콜드스타트 시간**
직전 대화에서 확인한 실제 로그 기준, treatment-serving(vLLM+MedGemma-4B) 컨테이너가
"요청을 받을 준비" 상태가 될 때까지 약 200초(`06:07:26`→`06:10:52`)가 걸렸고, 여기에
첫 요청의 실제 생성(generation) 시간이 더해진다. 그런데 Cloud Run 배포 설정의
`--timeout=300`은 **요청 하나가 응답을 받기까지 Cloud Run이 기다려주는 최대 시간**이다.
`min-instances=0`이라 매 최초 요청은 콜드스타트를 그대로 떠안는데, 이 300초 한도 안에
"컨테이너 기동 + 모델 로드(~157초, 로그 기준) + 프롬프트 처리 + 토큰 생성"이 전부
끝나야 한다. 여유가 매우 빠듯하며, 프롬프트가 길거나(RAG 근거 여러 개 삽입) `max_tokens`가
큰 요청이 겹치면 Cloud Run이 먼저 504로 요청을 끊어버릴 수 있다. 반면 Django
쪽(`medgemma_client.py`, `nginx.conf` `/api/`)은 900초까지 기다리도록 되어 있어
**계층 간 타임아웃 불일치**가 존재한다 — 인수인계 문서 "타임아웃 값을 상위 계층에서
항상 더 길게" 원칙과 반대 방향으로 어긋난 지점.

---

## 3. Django 백엔드 — 앱별 상세

### 3.0 `core/` — 앱 간 공통 규약 (모델 없음)

- **`core/responses.py`** — 전체 API의 에러 응답 포맷을 통일하는 두 헬퍼.
  - `error_response(message, *, code=None, status_code=400, details=None)` — `code`를 안 주면
    `status_code`에서 자동 유추(`_STATUS_TO_CODE` 매핑: 400→VALIDATION_ERROR, 401→AUTHENTICATION_FAILED,
    403→PERMISSION_DENIED, 404→NOT_FOUND, 409→CONFLICT, 502→UPSTREAM_ERROR).
  - `validation_error_response(serializer_errors)` — serializer 검증 실패 전용 래퍼.
  - 성공 응답은 래핑하지 않고 시리얼라이저 결과를 그대로 반환 — 에러 포맷만 통일.
- **`core/exceptions.py`** — `custom_exception_handler`. 뷰 안에서 `error_response()`로
  직접 처리 안 한 예외(권한 부족 403, 인증 실패 401, `raise_exception=True` 등)를 DRF 기본
  핸들러로 먼저 처리한 뒤, 같은 `{"error": {...}}` 포맷으로 재포장. `REST_FRAMEWORK.EXCEPTION_HANDLER`에
  등록되어 전역 적용.

### 3.1 `accounts/` — 인증·프로필·보호자·알림설정·FCM

**모델 구조 (11개 테이블)**

| 테이블 | 역할 |
|---|---|
| `User` | UUID PK, `role`(patient/doctor/nurse/pathologist/guardian), `AbstractBaseUser`+`PermissionsMixin` 상속. `USERNAME_FIELD='id'` — 로그인은 이 필드로 하지 않고 역할별 로그인 뷰(JWT 발급)로만 이뤄짐. `PermissionsMixin`은 순수하게 Django Admin이 `is_superuser`/`has_perm`을 요구해서 붙인 것. |
| `UserManager` | `create_patient`, `create_staff`, `create_superuser` — role별 생성 헬퍼만 제공, 범용 `create_user(username, password)` 없음 |
| `Hospital` | 병원 1곳 고정 전제, name/address/phone/map_image_url |
| `PatientAuth` | 환자 전용. `social_provider`+`social_uid` 유니크 조합, `phone_number` 유니크(SMS 인증은 미실시, 필드 자체 없음) |
| `StaffAuth` | 의사/간호사/병리사 공통. `email`+`password_hash`(직접 `make_password`/`check_password` 구현) |
| `PatientProfile` | `patient_number`는 저장 시 자동생성(영숫자 8자리 랜덤, 중복 체크 루프), `gender` nullable, `assigned_doctor` FK |
| `DoctorProfile` | `license_number` 유니크. `license_verified*` 필드는 세션 중 **의도적으로 제거됨**(형식체크만으로 "검증완료"라 표시하는 게 오해 소지) |
| `NurseProfile` / `PathologistProfile` | department + hospital만 |
| `DoctorOffDay` | 단발 휴진일 |
| `DoctorWeeklySchedule` | 요일(mon~sat)×기간(am/pm) 조합 유니크, 정기 진료 가능여부 |
| `DeviceToken` | FCM. `(user, app_type, device_id)` 유니크 — 기기 단위로 여러 대 동시 등록 가능 |
| `NotificationPreference` | `(user, category)` 유니크, 카테고리별 on/off |
| `GuardianLink` | `patient` FK + `guardian` FK(nullable, 등록 전엔 null) + `invite_code`(유니크) + `accepted_at` |

**인증 흐름**

- **의료진**: `POST /api/auth/staff/signup/` (email+password로 즉시 가입) → `POST /api/auth/staff/login/`.
  `StaffAuth.check_password`로 직접 검증 후 JWT 발급.
- **환자 (소셜로그인, 2단계)**:
  1. `POST /api/auth/patient/social-login/` — `accounts/services.py`의 `verify_social_token()`이
     Google(`oauth2.googleapis.com/tokeninfo` + `aud` 클레임 검증)/Kakao(`kapi.kakao.com/v2/user/me`)/Naver
     (`openapi.naver.com/v1/nid/me`) 세 provider에 **서버가 직접** 재검증 요청 (클라이언트가 준 social_uid를
     그대로 믿지 않음). 기존 회원이면 바로 JWT 발급, 신규면 `signup_token`(uuid4 hex)을 Redis 캐시에
     10분 TTL로 저장하고 반환.
  2. `POST /api/auth/patient/register/` — `signup_token` + `birth_date`/`hospital_id`/`phone_number`(필수)
     /`gender`(선택)로 최종 가입. **SMS 인증코드 확인 단계는 없음**(발신번호 사전등록 심사 문제로 코드
     자체를 뺌, 번호는 여전히 필수input이지만 실제 검증 안 함). 성공 시 `User`+`PatientAuth`+`PatientProfile`
     3개를 만들고 세션 삭제 후 JWT 발급.
- **로그아웃** — `POST /api/auth/logout/`. `RefreshToken(token).blacklist()`로 서버측 무효화.
  access는 클라이언트가 그냥 버리면 되지만, refresh는 탈취 시 재발급 위험이 있어 명시적으로 블랙리스트 등록.

**보호자(guardian) 흐름 — 초대코드 방식(별도 PIN 없이 JWT 저장 재로그인)**

1. 환자: `POST /api/auth/guardian/invite/` — 미등록(`accepted_at IS NULL`) 코드가 있으면 재생성(교체),
   없으면 신규 생성. 이미 등록완료된 링크는 유지되므로 환자 1명당 보호자 여러 명 허용.
2. 보호자: `POST /api/auth/guardian/register/` — `invite_code`로 미사용 링크 탐색 → `role=guardian`인
   새 `User` 생성(`set_unusable_password()`, 별도 프로필 테이블 없음) → 링크에 `guardian`/`accepted_at` 채움
   → JWT 발급.
3. 이후 보호자는 `guardian/patients/`(연결된 환자 목록), `guardian/patients/{id}/summary/`
   (케이스 상태·다음 예약·최근 증상체크 요약 — 열람 전 반드시 `GuardianLink.accepted_at` 존재 확인)로 조회.

**FCM 디바이스 토큰 등록 (`register_device_token`)**

- `app_type` 검증: `patient`/`guardian` role → `patient_app`, 그 외(의료진) → `medical_app`만 허용.
- 같은 `fcm_token` 문자열이 다른 (user, app_type, device_id) 조합에 이미 걸려있으면 그 레코드를
  삭제하고 현재 요청 기준으로 새로 `update_or_create` — **동일 토큰이 다른 사용자/기기로 이동한 경우
  이전 연결을 정리**하는 로직.

**⚠️ 발견된 이슈 — `register_device_token`에서 `NameError` 발생 가능**
`accounts/views.py` 상단 import 목록에 `from django.db import transaction`이 없는데,
`register_device_token()` 본문에서 `with transaction.atomic():`을 사용한다. 이 엔드포인트가
호출되는 순간(FCM 토큰 최초 등록/갱신 — 앱 실행 시마다 호출될 가능성이 높은 지점) 바로
`NameError: name 'transaction' is not defined`로 500이 날 것으로 보인다. 다른 앱(`cases/views.py`,
`appointments/views.py`)은 정상적으로 `from django.db import transaction`을 import하고 있어
`accounts/views.py`만 누락된 상태.

**역할 기반 권한 (`accounts/permissions.py`)**

```
IsPatient / IsDoctor / IsNurse / IsPathologist / IsGuardian   — 단일 role 체크
IsDoctorOrNurse   — 의료진 앱(Flutter) 공통, 병리사 제외
IsMedicalStaff    — doctor/nurse/pathologist 전부 허용 (React 웹 포함)
```

모두 `request.user.role`을 직접 비교하는 단순 `BasePermission` 서브클래스 — 객체 단위(row-level)
권한은 각 view 함수 안에서 개별적으로 처리(예: `case_detail`에서 `case.patient_id != request.user.id` 비교).

---

### 3.2 `cases/` — AI 케이스 파이프라인 (프로젝트의 핵심 도메인)

**모델 구조 — "불변 원본 vs 의사 확정본" 3단 분리가 설계의 핵심**

| 테이블 | 역할 |
|---|---|
| `Case` | 파이프라인 상태 껍데기만 — 진단 데이터는 전혀 안 담고 `status`(uploaded→processing→pending_review→confirmed/rejected/failed)와 `current_step`(전처리→특징추출→핵검출→분류→결과생성)만 관리 |
| `AIAnalysisResult` | **불변**. 재분석해도 기존 레코드를 덮어쓰지 않고 항상 새로 쌓음(모델 버전 이력 보존). LUAD/LUSC 확률, 핵밀도/이형성 점수, MedGemma RAG 초안(`treatment_note`) 포함 |
| `NucleiPatch` | AI 결과에 딸린 상위 attention 패치 5장(원본+오버레이 GCS 경로) |
| `GenePrediction` | TP53/KEAP1/KRAS 확률값 그대로 저장(`(ai_result, gene_name)` 유니크) — 별도 이진분류 컬럼 없음 |
| `ConfirmedFinding` | `Case`와 1:1. 의사의 최종 판단 — 승인이든 수정이든 결과적으로 여기 하나만 생김. `based_on_result`로 어떤 AI 결과를 근거했는지 `PROTECT`로 참조 |
| `CaseReviewLog` | 감사이력. `action`(rejected/confirmed/edited)별로 매 판독 행위를 기록 — `ConfirmedFinding`과 달리 이력이 쌓임 |
| `CaseFinding` | 의사가 뷰어(heatmap/overlay/original)에 그린 프리핸드 드로잉 좌표(JSON) |
| `CaseFavorite` | 의사별 즐겨찾기, `(user, case)` 유니크 |

**핵심 흐름 1 — 케이스 생성 (병리사, React 웹)**

`POST /api/cases/` (`case_list_create`, `IsPathologist`만 통과):
- `specimen_id`/`slide_gcs_path`/`patient_id` 필수 검증 → 환자 존재+활성 여부 확인 →
  `specimen_id` 중복이면 409.
- `Case.objects.create()`가 `IntegrityError`를 던지면 `_is_specimen_id_unique_violation()`으로
  **DB 제약 이름을 직접 비교**(`cases_case_specimen_id_key`)해서, 진짜 specimen_id 중복인지 아니면
  다른 무결성 오류(FK 문제 등)인지 구분 — 무조건 "중복"으로 뭉뚱그리던 과거 버그를 고친 지점.
- 생성 직후 `call_mosec_thumbnail()`로 **동기적으로** 썸네일까지 만들어서 응답에 포함(실패해도
  케이스 생성 자체는 201로 성공, 썸네일 실패는 로그만 남김).

**핵심 흐름 2 — AI 추론 실행 (`POST /api/cases/{id}/predict/`, `predict_case`, `IsPathologist`)**

1. `case.status`를 `processing`으로 바꾸고 즉시 저장 (동시 중복 실행 방지 — 이미 `processing`이면 409).
2. `call_mosec_predict()` — `cases/services.py`. Cloud Run mosec-serving에 ID 토큰 인증으로
   POST, **timeout=900초**. 실패하면 `case.status=failed`로 되돌리고 502 반환 + 알림.
3. 썸네일이 아직 없으면(신규 업로드 흐름에서 이미 만들었을 수도 있어 조건부) 여기서도 재시도.
4. `generate_treatment_note()`(`rag/rag_service.py`) 호출 — mosec이 반환한 유전자 확률을 넣어
   MedGemma RAG 소견 생성. 실패해도(`RAGServiceError`) `treatment_note=None`으로 두고 계속 진행 —
   AI 분류 결과 자체는 RAG 실패와 무관하게 저장됨.
5. `transaction.atomic()` 블록 안에서 `AIAnalysisResult` + `NucleiPatch`(5개) + `GenePrediction`(3개)를
   한번에 생성하고 `case.status=pending_review`로 전환.
6. `_notify_analysis_outcome()` — 업로드한 병리사에게 "AI 분석 완료" 알림 + **활성 의사 전원**에게
   "검토 대기 케이스" 알림(병원 1곳 고정 전제라 필터링 없이 전체 의사 대상).

**⚠️ 발견된 이슈 — predict_case 전체가 gunicorn 워커 하나를 900초까지 통째로 점유**
gunicorn은 WSGI 동기 워커 3개(`--workers 3`)로 뜨는데, `predict_case`는 mosec 호출(최대 900초)과
MedGemma 호출(최대 900초, 콜드스타트 시 treatment-serving은 위 §2.3에서 본 대로 300초 컷오프
위험까지 있음)을 **뷰 함수 안에서 순차적으로, 동기 블로킹으로** 수행한다. 워커가 3개뿐이라 이
엔드포인트가 동시에 3번 호출되면(병리사 여럿이 거의 동시에 분석 시작) 그 순간 서버 전체가 다른
모든 API 요청(로그인, 채팅 REST 저장 호출 등)에 응답 불가 상태가 될 수 있다. Celery가 이미
인프라에 존재하므로, 이 호출을 Celery task로 비동기화하고 `update_case_step` 콜백으로 진행 상황을
Flutter/React가 폴링하는 구조로 바꾸는 게 구조적으로 안전해 보인다(콜백 엔드포인트는 이미 있음 — 아래 참고).

**진행률 콜백 (`POST /api/cases/{id}/step/`, `update_case_step`)**
- `AllowAny` + `X-Internal-Token` 헤더를 `INTERNAL_CALLBACK_TOKEN`(env)과 직접 비교하는 방식으로
  인증 — mosec-serving(`callback.py`)이 각 처리 단계마다 이걸 호출해서 `Case.current_step`을 갱신.
  JWT가 아니라 고정 공유 토큰이라는 점에서 다른 엔드포인트와 인증 방식이 다름(외부 서비스 콜백이라
  불가피한 선택으로 보임).

**핵심 흐름 3 — 의사 판독 (`POST /api/cases/{id}/review/`, `review_case`, `IsDoctor`)**

- `case.status`가 `pending_review`가 아니면 400, 이미 `ConfirmedFinding`이 있으면 400 — 판독은 케이스당 1회.
- `action`:
  - `confirm` — 최신 `AIAnalysisResult`의 `prediction_label`/`treatment_note`를 그대로
    `ConfirmedFinding`에 저장, `CaseReviewLog.action=confirmed`.
  - `edit` — 의사가 보낸 `final_subtype`/`final_note`로 저장, `action=edited`.
  - `reject` — `ConfirmedFinding`을 만들지 않고 `CaseReviewLog.action=rejected`만 남기고
    `case.status=rejected`로 종료. **재분석을 자동으로 트리거하는 로직은 없음** — 필요하면
    `predict_case`를 다시 호출해야 함(케이스 상태가 `rejected`인 채로는 `predict_case`가
    상태 체크를 하지 않으므로 그대로 재호출 가능해 보이나, 명시적 "재시도" API는 별도로 없음).
- `confirm`/`edit` 성공 시 환자에게 `case_review` 카테고리로 "검사결과가 공개되었습니다" 알림
  — 이 시점이 곧 `released_at`(= `confirmed_at`)이 되는 지점.

**환자용 결과 조회 (`GET /api/cases/my-results/`, `GET /api/cases/my-results/{id}/`)**

- `_released_patient_results()` 헬퍼로 `status=confirmed AND confirmed_finding__isnull=False`만
  필터 — 미확정 케이스는 목록에서 완전히 배제(존재 자체를 노출 안 함). 단건 조회에서 미확정/타인
  케이스는 404(403이 아님 — 존재 여부 자체를 숨기는 방식).

**케이스 조회 권한 (`case_detail`)**

- 환자: 본인 케이스만, 그리고 `status=confirmed`일 때만 열람 가능(그 전 상태는 403).
- DELETE는 병리사만 — 의사/간호사는 GET 권한을 통과해도 삭제는 못 함(의료법 보관의무 고려한
  의도적 제한이라는 주석). 삭제 시 GCS의 보고서 이미지/원본 슬라이드 파일도 함께 삭제(`gcs_signed_url.py`).

**`CaseListSerializer` vs `CaseDetailSerializer` — 필드가 다름**

목록(`GET /api/cases/`)과 상세(`GET /api/cases/{id}/`)는 완전히 다른 시리얼라이저를 쓰고, 특히
이미지 URL류는 **상세에만** 있다.

```python
class CaseListSerializer(serializers.ModelSerializer):
    fields = ["id", "specimen_id", "status", "patient_name",
              "prediction_label", "luad_probability", "lusc_probability",
              "uploaded_at", "completed_at", "is_confirmed", "is_favorite"]
    # slide_thumbnail_url, heatmap_url 둘 다 없음 — 목록 화면에서 썸네일 표시 불가

class CaseDetailSerializer(serializers.ModelSerializer):
    slide_thumbnail_url = serializers.SerializerMethodField()   # 최상위 필드
    latest_ai_result = serializers.SerializerMethodField()       # 안에 heatmap_url 중첩
    confirmed_finding = ...                                        # 확정 전이면 null

class AIAnalysisResultSerializer(serializers.ModelSerializer):
    heatmap_url = serializers.SerializerMethodField()   # latest_ai_result.heatmap_url
```

- `slide_thumbnail_url`은 `Case` 테이블 자체 필드(`slide_thumbnail_gcs_path`)를 서명 URL로 변환한
  것 — 원본 슬라이드 자체에 딸린 데이터라 AI 분석 여부와 무관하게 항상 최상위에 존재.
- `heatmap_url`은 `AIAnalysisResult`(특정 분석 실행의 산출물)에 속하는 데이터라 **최상위가 아니라
  `latest_ai_result.heatmap_url`로 한 단계 중첩**돼 있음. `latest_ai_result`는 `obj.ai_results.first()`가
  없으면(=아직 `predict/`를 호출 안 한 `status=uploaded` 케이스) `null`이 되고, 당연히 그 안의
  `heatmap_url`도 응답 자체에 나타나지 않는다.
- 둘 다 `gcs_path_to_signed_url()`을 거쳐 **만료시간이 있는 서명 URL**로 나가므로, 캐싱하면 안 되고
  화면 진입 시마다 새로 상세 API를 불러야 유효한 URL을 받는다.
- `confirmed_finding`은 의사가 확정하기 전까지 `null` — `case_detail`은 "확정본만 주는 API"가
  아니라 **그 순간의 파이프라인 상태를 그대로** 보여주는 API다. 무조건 확정된 것만 필요하면
  `GET /api/cases/my-results/`(환자 전용, 미확정은 목록/단건 조회 모두에서 배제)를 써야 한다.

---

### 3.3 `rag/` — MedGemma + FAISS 기반 소견 생성 (cases 앱이 호출하는 별도 모듈)

- Django 앱이 아니라 순수 Python 모듈(`INSTALLED_APPS`에 없음), `cases/views.py`가 직접 import해서 사용.
- **유전자별 threshold**(`rag_service.py`) — 모델이 뱉는 확률을 그대로 쓰지 않고 유전자별로 다른
  최적 threshold와 비교해 양성/음성 판정: `TP53=0.6626`, `KEAP1=0.0956`, `KRAS=0.1453`.
- **근거 검색 → 분류 → 프롬프트 구성 파이프라인**:
  1. `search_evidence_by_gene()` — 양성 판정된 유전자마다 FAISS(`search_faiss.py`, PDF 5종 임베딩)를
     검색(`top_k_per_gene=3`), 같은 출처 문서가 과반 이상 몰리지 않게 `limit_results_per_source()`로 제한.
  2. `classify_search_result()` — 검색된 청크를 세 종류로 분류: `direct`(대상 유전자만 직접 다룸,
     MedGemma에 실제로 전달됨) / `co_mutation`(다른 유전자와 동시 언급, 전달 안 함) / `excluded`(대상
     유전자 언급 자체 없음).
  3. **KRAS는 MedGemma에 넘기지 않고 코드에서 고정 문구로 생성** — `kras_fixed_interpretation_text()`/
     `kras_fixed_treatment_text()`가 FDA 라벨 문서(Sotorasib/Adagrasib)에서 검색된 근거가 있을 때만
     약제명을 문구에 넣고, 없으면 "직접 근거 없음"으로 고정. TP53/KEAP1만 실제로 MedGemma가 해석.
  4. `call_medgemma()`(`medgemma_client.py`)가 Cloud Run treatment-serving(vLLM OpenAI 호환 엔드포인트
     `/v1/chat/completions`)을 호출. system prompt에 "제공된 근거만 사용", "KRAS 예측만으로 G12C 확정 금지",
     "확정 분자검사 없이 치료 처방 금지" 등 10개 규칙을 명시 — 모델이 근거 밖 추정을 하지 않도록 강하게 제약.
  5. 최종 `treatment_note`는 "1. AI 예측 요약 / 2. 유전자별 해석 / 3. 치료 검토 / 4. 추가 필요 검사 /
     5. 주의사항" 5개 섹션으로 조립되는데, **2·3번만 MedGemma(또는 KRAS 고정문구)가 채우고 1·4·5번은
     전부 코드에서 결정론적으로 생성** — 환각(hallucination) 리스크를 소견의 일부 구간에만 국한시키는 설계.
- `call_medgemma()`의 `timeout=900`, 실패 시 `MedGemmaError`(콜드스타트 가능성을 에러 메시지에 명시).

---

### 3.4 `symptoms/` — 일일 증상체크 + 위험도 룰엔진

**모델**: `SymptomCheck` — 8개 증상 필드(JSON이 아니라 개별 choice 필드로 보임, `SymptomSubmitSerializer`가
8개를 모두 필수로 검증) + `risk_level`(green/yellow/red) + `visible_to_nurse` + `nurse_reviewed*`.

**위험도 판정 (`rules.py`, 순수 함수, 하드코딩된 룰)**

```
RED    : 객혈="다량"  OR (호흡곤란="안정시에도" AND 발열="38이상")
YELLOW : 객혈="소량"  OR 흉통="심함"           OR 발열="37.5~38"
GREEN  : 그 외 전부
```

**제출 흐름 (`submit_check`, `IsPatient`)**

- 하루 1회 제한 — 오늘 날짜로 이미 제출한 기록이 있으면 409.
- `visible_to_nurse`는 **RED면 무조건 True**(환자의 열람권한 설정과 무관하게 강제 공개), 그 외에는
  직전 체크의 `visible_to_nurse` 값을 그대로 이어받음(`_current_visibility`) — 즉 환자가 껐다 켰다
  설정하면 다음 체크부터 반영되는 구조.
- RED/YELLOW면 `_notify_care_team()` — 환자의 담당의(`assigned_doctor`)와 **같은 진료과 소속 간호사
  전원**에게 `triage` 카테고리 알림. 담당의가 없으면(assigned_doctor null) 알림 대상이 간호사만 남을
  수 있음.
- 간호사 조회(`nurse_visible_checks`)는 `visible_to_nurse=True` **또는** `risk_level=red`인 것만 —
  RED는 환자가 비공개로 설정해놨어도(이론상 불가능하지만 데이터 정합성 관점에서) 항상 노출.

---

### 3.5 `medications/` — 복약 스케줄·순응도·Celery 알림

**Celery Beat 스케줄 (`config/settings.py`에 등록, 매 실행은 `medications/tasks.py`)**

| 태스크 | 주기 | 로직 |
|---|---|---|
| `send_due_medication_reminders` | 60초마다 | `scheduled_time`이 지금~5분전 사이이고 `taken=False`, `reminder_sent_at IS NULL`인 로그를 찾아 정시 알림 발송 후 `reminder_sent_at` 기록(중복발송 방지) |
| `check_medication_compliance` | 3600초마다 | `scheduled_time`이 2시간 이상 지났는데 `taken=False`인 로그 전부에 환자 본인에게만 "복약 확인 필요" 알림 |

**⚠️ 발견된 이슈 — `check_medication_compliance`에 재발송 억제 필드가 없음**
`send_due_medication_reminders`는 `reminder_sent_at`으로 한 번만 보내도록 막혀 있지만,
`check_medication_compliance`는 그런 필드가 전혀 없다. 즉 한 번 복용을 놓친 로그는 **`taken=True`로
바뀌기 전까지 매시 정각마다(스케줄 3600초) 계속 같은 "복약 확인이 필요합니다" 알림이 재발송**된다.
설계 의도(경고성 반복 알림)일 수도 있지만, 하루 이상 방치되면 알림이 수십 건 쌓여 오히려 알림
피로도를 높이고 실제 위급 알림(RED 증상체크 등)을 묻히게 할 위험이 있다.

- 간호사에게는 순응도 관련 능동 알림이 전혀 없음(주석에 명시된 의도적 설계) — 간호사는 담당환자
  목록 화면에서 월간 순응도 API(`GET /api/medications/logs/compliance/monthly/`)를 직접 조회해야만 확인 가능.

---

### 3.6 `appointments/` — 예약 신청~확정~체크인

**슬롯 테이블은 DB에 없음 — 코드에 하드코딩된 시간 배열로 계산**

```python
SLOTS_AM = ["09:00", "09:30", ..., "11:30"]   # 6타임
SLOTS_PM = ["13:00", "13:30", ..., "16:30"]   # 8타임
```

`_available_slots_for_date(doctor_id, date)`가 매 요청마다 다음을 조합해 가용 슬롯을 계산:
1. `DoctorOffDay`에 해당 날짜가 있으면 그날은 전체 마감.
2. `DoctorWeeklySchedule`에서 해당 요일의 am/pm `available` 여부로 후보 슬롯군 결정.
3. 이미 활성 상태(`requested`/`confirmed`/`reminded_d7`/`reminded_d1`)인 `Appointment`가 점유한
   시간을 후보에서 제외.
4. 추가로 `_slot_response_for_date()`에서 현재 시각 이전 슬롯도 `closed` 처리.

**동시 예약 선점 방지 — 2단 방어**

1. **애플리케이션 레벨**: `create_appointment`에서 `_available_slots_for_date()`로 사전 확인 후 생성.
2. **DB 레벨(최종 방어선)**: `Appointment.Meta.constraints`의 조건부 유니크 제약
   `uniq_active_doctor_slot` — `(doctor, requested_at_slot)` 조합이 활성 상태(4종) 중 하나일 때 유일해야
   함. 두 요청이 동시에 1단계를 통과해도 `IntegrityError`가 나면 `create_appointment`가 이를 잡아
   409(`CONFLICT`)로 변환. — 애플리케이션 체크만으로는 레이스 컨디션을 못 막는다는 걸 인지하고
   DB 제약을 진짜 방어선으로 둔 설계.

**간호사 큐 (`request_queue`)**: `status=requested`이면서 **본인 소속 진료과와 일치하는** 예약만 반환
— 병원 1곳 고정이지만 진료과 단위로는 여전히 필터링됨.

**의사 API 2종 구분**: `my_appointments`(환자 전용, "내 예약") vs `doctor_my_appointments`
(의사 전용, "내가 진료할 예약 목록") — 과거 세션에서 의사 계정이 `/mine/`을 호출하면 항상 403이
나던 버그를 고치며 후자를 신규 추가했다는 주석이 코드에 그대로 남아있음.

---

### 3.7 `intake/` — 문진표 (완전 자유 JSON 스키마, 문항 목록은 백엔드에 없음)

- 모델은 `IntakeForm.content = JSONField()` 하나뿐 — 문항 구조 자체가 DB 스키마가 아니라 매 요청의
  JSON payload 안에 통째로 들어있음(`status`: draft/submitted, `questions[]`: 각 문항의 id/텍스트/타입
  /선택지/필수여부/답변을 모두 포함).
- **실제 문항 목록(흡연력·가족력·현재증상 등)은 백엔드 코드 어디에도 정의돼 있지 않다.** 최초 `GET`
  호출 시 자동 생성되는 기본값은 완전히 빈 draft다:
  ```python
  form, _ = IntakeForm.objects.get_or_create(
      patient=request.user,
      defaults={"content": {"status": "draft", "questions": []}},   # 질문 0개
  )
  ```
  즉 "이 문진표엔 어떤 질문들이 있는가"는 서버가 아니라 **최초에 문항 목록을 채워 `PUT`하는 클라이언트
  (Flutter)**가 결정한다. 서버는 그렇게 들어온 JSON이 아래 스키마 규칙을 지키는지만 검증한다.
- 문항 타입 3종: `single_choice`(문자열 답), `multiple_choice`(문자열 배열), `text`(자유서술).
- `submitted` 상태로 최종 제출할 때만 서버가 다음을 검증: 문항 ID 중복 금지, 선택형은 `options` 필수/
  주관식은 `options` 사용 불가, 단일/복수 선택 답이 실제 `options` 안에 있는지, 필수 문항 응답 여부.
  `draft` 상태에서는 이 검증을 전부 건너뛰고 그대로 저장 가능(임시저장).

**API 3종**

| API | 권한 | 역할 |
|---|---|---|
| `GET/PUT /api/intake/mine/` | `IsPatient` | 조회(없으면 빈 draft 자동생성)/저장 |
| `GET /api/intake/{patient_id}/` | `IsNurse` | 간호사가 환자 상세화면에서 읽기 전용 조회, 폼이 없으면 `{"content": null}` |
| `POST /api/intake/qr-token/` | `IsPatient` | 프로필+문진표 QR 공유용 임시 토큰 발급 |
| `GET /api/intake/qr/{token}/` | `IsNurse` | QR 스캔 시 프로필 요약+문진표 내용 조회 |

**QR 공유 흐름 — Postgres가 아니라 Redis 캐시에만 존재**

- `issue_qr_token()` — `secrets.token_hex(16)`으로 토큰 생성, `cache.set(f"qr_token:{token}", user_id,
  timeout=300)`로 **Redis에 5분 TTL로만** 저장(DB에 영구 기록 없음). 환자 앱이 QR코드로 렌더링.
- `resolve_qr_token()` — 간호사가 스캔하면 캐시에서 `patient_id`를 조회해 이름/환자번호/생년월일+
  문진표 `content`를 한 번에 반환. 5분 지나면 캐시가 자동 만료되어 404(`QR이 만료되었거나 유효하지
  않습니다`) — 방문처리 같은 상태변경은 여기서 하지 않는 순수 조회용 엔드포인트.

---

### 3.8 `communication/` — 채팅(REST) + 알림(notify) + FCM

**채팅은 의사↔간호사 전용** — `ChatThread`/`ChatThreadParticipant`/`Message`/`MessageMention` 전부
`IsDoctorOrNurse` 권한. 환자는 채팅 기능이 없고(코드 주석: "AI챗봇만") 대신 genkit-service의
`/ai/chat`을 사용.

- `department_counterparts()` — "같은 과" 상대만 대화 시작 가능 목록으로 노출(의사→간호사,
  간호사→의사, 본인 department 기준).
- `message_list_create()`(POST)가 실제 메시지 저장 로직의 본체 — WebSocket(`realtime-service`)은
  이 REST 엔드포인트를 내부적으로 호출하기만 하고 저장 로직을 따로 구현하지 않음(§5 참고).
  멘션된 사용자에게는 "언급했습니다" 알림, 나머지 참여자에게는 일반 채팅 알림 — 카테고리는 둘 다 `chat`.

**`MessageSerializer` — `sender`는 객체가 아니라 UUID 문자열**

```python
class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)
    class Meta:
        fields = ["id", "thread", "sender", "sender_name", "content", "voice_url", "created_at"]
```

`sender`에 별도 nested 시리얼라이저를 지정하지 않아서 DRF 기본값(PrimaryKeyRelatedField)으로
**UUID만** 내려간다 — `{id, name, role}` 같은 객체가 아니다. `role` 필드는 메시지 응답 어디에도
없다. 클라이언트에서 "내가 보낸 메시지인지" 판단은 `message.sender == 내_user_id`(문자열 비교)로
하면 되고, 표시용 이름은 `sender_name`(flat 문자열)을 쓴다.

**`ChatThreadSerializer` — 스레드 목록 카드용**

```python
class ChatThreadSerializer(serializers.ModelSerializer):
    other_participant_name = serializers.SerializerMethodField()  # 나 제외 상대 이름
    last_message = serializers.SerializerMethodField()             # 최근 메시지 본문(문자열)
    unread_count = serializers.SerializerMethodField()             # 항상 0 반환
```

`unread_count`는 시리얼라이저 안에 **항상 `0`을 반환하도록 고정**돼 있다 — 코드 주석에 "읽음추적
테이블(MessageReadStatus)은 의료진앱 정책상 제거됨, '안읽음' 배지는 지금 단순 근사값도 없음"이라고
명시. 실제로 읽음 여부를 추적하는 테이블 자체가 없으므로, 프론트에서 이 값으로 안읽음 배지 UI를
만들면 항상 0으로만 보인다 — 안읽음 카운트가 필요하면 현재 스키마로는 구현 불가하고 별도 모델 추가가
선행돼야 한다.

**`notify()` — 전체 서비스의 유일한 알림 발송 지점 (`communication/services.py`)**

```python
def notify(recipient_id, category, title, body, deep_link=None):
    if category not in Notification.Category.values:
        raise ValueError(...)          # 허용 안 된 카테고리는 예외 발생 — 호출부에서 막힘
    pref = NotificationPreference.objects.filter(user_id=recipient_id, category=category).first()
    if pref and not pref.enabled:
        return None                     # 꺼져있으면 DB 기록조차 안 남기고 조용히 스킵
    notification = Notification.objects.create(...)      # 항상 먼저 DB 저장
    transaction.on_commit(lambda: _send_fcm(...))          # 커밋 후에만 FCM 발송 시도
    return notification
```

- `transaction.on_commit()`을 쓴 이유 — 호출부가 아직 진행 중인 트랜잭션 안에서 `notify()`를 부르는
  경우(`cases/views.py`의 `review_case` 등)가 많은데, 트랜잭션이 롤백되면 존재하지도 않을 알림에 대해
  FCM을 먼저 쏴버리는 걸 막기 위함 — 커밋이 확정된 뒤에만 FCM 발송을 시도.
- `_send_fcm()` — 대상 유저의 `DeviceToken` 전부(여러 기기 동시 가능)에 순회 발송. Firebase 초기화
  자체가 실패하면(크리덴셜 미설정 등) 콘솔 로그만 남기고 조용히 넘어감(개발환경 폴백).
  `messaging.UnregisteredError`(앱 삭제/토큰 만료로 더 이상 유효하지 않음)를 잡으면 그 `DeviceToken`을
  **DB에서 바로 삭제** — 죽은 토큰이 계속 쌓이지 않도록 자동 정리.


---

## 4. `realtime-service` — FastAPI 실시간 채팅 릴레이 (ASGI)

**Django Channels가 아니라 별도 FastAPI 서비스 + Redis Pub/Sub로 구현되어 있음.**
Django 자체는 여전히 WSGI로 유지하고, 실시간 통신만 이 서비스가 전담하는 구조.

### 4.1 파일 구성

| 파일 | 역할 |
|---|---|
| `app/main.py` | FastAPI 앱, `chat`/`internal_rag` 라우터 등록, `/health` |
| `app/auth.py` | Django가 발급한 JWT를 PyJWT로 직접 디코드(HS256, `DJANGO_SECRET_KEY` 공유) |
| `app/chat.py` | `/ws/chat/{thread_id}` WebSocket 엔드포인트 — 실제 릴레이 로직 |
| `app/internal_rag.py` | `/internal/rag/search` — genkit-service가 호출하는 FAISS 검색 프록시 |
| `app/config.py` | 환경변수 (`DJANGO_INTERNAL_BASE_URL`, `REDIS_CHAT_URL`) |

### 4.2 WebSocket 채팅 흐름 (`chat.py`)

```
1. 클라이언트가 ws://.../ws/chat/{thread_id}?token=<JWT> 로 연결
2. require_ws_token(token) — JWT 검증 실패시 연결 자체를 거부(WebSocketException)
3. 연결 수락 후 Redis 채널 "chat:{thread_id}" 구독 시작 (relay_from_redis 태스크를 별도 asyncio task로 기동)
4. 클라이언트가 메시지를 보내면 → 저장 로직을 여기서 재구현하지 않고
   Django REST(POST /api/communication/threads/{id}/messages/)를 내부 HTTP로 호출
   (연결시 검증된 JWT를 Authorization 헤더에 그대로 재사용)
5. Django가 응답한 메시지(멘션 파싱·알림 발송까지 이미 끝난 상태)를 그대로 Redis 채널에 publish
6. 그 채널을 구독 중인 "모든" FastAPI 워커가 각자 연결된 WebSocket 클라이언트에게 전달
   → 워커가 여러 개 떠 있어도 Pub/Sub 덕분에 전원이 메시지를 받음 (Channels 없이 동일한 효과를 냄)
```

- 메시지 저장의 단일 진실 공급원(source of truth)은 항상 Django REST — WebSocket 계층은 순수하게
  전달(relay) 역할만 하고 비즈니스 로직(멘션 알림 등)을 중복 구현하지 않음. 다만 이 설계상 **메시지
  하나마다 WebSocket 서버 → Django REST로 내부 HTTP 왕복이 발생**하므로, Django가 느려지면(§3.2에서
  본 `predict_case`처럼 워커를 오래 붙잡는 요청이 겹치면) 채팅 전송도 함께 지연될 수 있음 — 두 서비스가
  컨테이너로는 분리돼 있지만, 메시지 저장 경로에서는 여전히 Django(gunicorn 워커풀)에 의존적.

**클라이언트 관점 — "보내기"와 "받기"가 같은 WS 채널 하나로 순환한다**

```
연결       wss://.../ws/chat/{thread_id}?token={access_token}   (토큰은 쿼리파라미터)
전송(→)    { "content": "...", "voice_url": null, "mentioned_user_ids": [] }
수신(←)    Message 객체 그대로 (§3.8의 MessageSerializer 필드) — 내가 보낸 것도 이 채널로 되돌아옴
```

REST(`GET .../messages/`)는 화면 진입 시 과거 기록을 1회 불러오는 용도로만 쓰고, 메시지 송수신은
전부 WS 하나로 처리한다. REST `POST`로 직접 메시지를 보내도 저장은 되지만 Redis publish 단계를
거치지 않으므로(그 publish는 WS 핸들러 코드 안에서만 일어남) **다른 클라이언트에게 실시간 전파가
안 된다** — 반드시 WS로 보내야 한다.

### 4.3 인증 (`auth.py`)

- Django simplejwt 토큰을 그대로 검증(같은 `SECRET_KEY`, `HS256`) — 별도 인증서버 없음.
- 코드 주석에 명시: simplejwt 기본 클레임에는 `role`이 안 실려있어서, 이 서비스는 role 기반 검증을
  하지 않고 **스레드 참여자 검증을 전부 Django REST 응답에 위임**(Django가 403을 주면 그대로 클라이언트에
  에러 전달)하는 구조.

### 4.4 내부 RAG 검색 프록시 (`internal_rag.py`)

- genkit-service(Node.js)는 FAISS 인덱스에 직접 접근할 수 없음(Python 전용 라이브러리 + OpenAI
  임베딩으로 구축된 인덱스) — 그래서 이 서비스가 `backend/rag/search_faiss.py`를 `sys.path`에
  추가해서 **백엔드 코드를 그대로 import**해 재사용하고, `/internal/rag/search`로 HTTP 프록시만 제공.
- 코드 주석에 "nginx가 `/internal/` 경로를 프록시하지 않아야 함"이라고 명시 — 실제 `nginx.conf`에도
  `/internal/`을 외부로 노출하는 location 블록이 없어 이 전제는 지켜지고 있음(컨테이너 네트워크 내부
  `realtime:8001`로만 genkit-service가 접근 가능).

---

## 5. `genkit-service` — AI 챗봇 오케스트레이션 (Node.js + Genkit + MCP)

과거 "키워드매칭 기반 FastAPI 챗봇"을 폐기하고, **Gemini가 스스로 tool-calling으로 판단**하는
방식으로 전면 재구축된 버전.

### 5.1 구조

```
index.js      Express 서버. POST /ai/chat — JWT 검증(HS256, 공유 SECRET_KEY) 후 chatFlow() 호출
flow.js       Genkit 오케스트레이션 — 4개 tool을 Gemini에 등록하고 generate() 실행
mcpServer.js  MCP 서버(자식 프로세스) — 개인데이터 조회 tool 3개를 stdio로 노출
```

### 5.2 Tool 4종

| Tool | 종류 | 구현 |
|---|---|---|
| `get_my_appointments` | MCP (개인데이터) | Django `/api/appointments/mine/`을 authToken으로 호출, 가장 가까운 확정 예약 1건 요약 |
| `get_my_medications` | MCP (개인데이터) | Django `/api/medications/logs/today/` 호출, 오늘 복약 완료/전체 카운트 |
| `get_my_case_result` | MCP (개인데이터) | Django `/api/cases/?status=confirmed` 호출, 최신 1건의 `prediction_label` |
| `search_general_knowledge` | Genkit 네이티브 tool (MCP 아님) | `realtime-service`의 `/internal/rag/search`를 axios로 직접 호출(FAISS) |

- 개인데이터 3개는 **MCP 서버(`mcpServer.js`)를 자식 프로세스로 stdio 연결**해서 등록(`connectMcp()`가
  최초 1회만 프로세스를 띄우고 이후 재사용) — genkit-service 자체는 개인데이터에 대한 DB 접근이나
  비즈니스 로직을 전혀 갖지 않고, Django REST API를 그대로 호출할 뿐.
- **보안 핵심 설계**: `patientId`를 LLM이 인자로 만들어내지 않는다. 대신 대화 시작 시 전달받은
  `authToken`(로그인한 환자 본인의 JWT)을 tool 호출 인자로 그대로 흘려보내고, Django가 토큰에서
  강제로 사용자를 추출해 응답 범위를 제한한다 — 모델이 프롬프트 상에서 "다른 환자 ID를 조회해줘"라고
  스스로 판단하거나 사용자가 그렇게 유도해도, Django 쪽에서 토큰 소유자 기준으로만 응답하므로 타
  환자 데이터 조회가 애초에 불가능한 구조(코드 주석에 명시).

### 5.3 `chatFlow` (system prompt 요지)

- 개인정보(예약/복약/검사결과) 질문은 반드시 tool로 조회, `authToken` 인자는 항상 주어진 값을 그대로
  쓰고 스스로 만들어내지 말 것을 명시.
- 일반 의학지식 질문은 `search_general_knowledge`의 검색 범위 안에서만 답하도록 제약(임의 지식 사용 금지).
- 모든 답변 끝에 "참고정보이며 담당 의료진과 상의하라"는 안내 문구를 붙이도록 지시.

**클라이언트 관점 — 단발 요청-응답, 스트리밍·서버측 히스토리 없음**

```
POST /ai/chat
Authorization: Bearer {access_token}
{ "message": "다음 진료 언제예요?" }
                                            ↓  (요청 1건 = 응답 1건, WS 아님)
{ "answer": "..." }
```

- `chatFlow()`가 `ai.generate()`를 한 번 호출해 완성된 텍스트를 통째로 반환하는 구조라 토큰 단위
  스트리밍은 없다 — 응답 올 때까지 로딩 상태로 기다려야 한다.
- 입력이 `{message, authToken}` 뿐이고 서버가 대화 맥락을 세션/DB에 저장하지 않는다 — **멀티턴
  대화(이전 질문 이어서 묻기)가 필요하면 클라이언트가 이전 대화 내용을 매 요청의 `message`에
  이어붙여 보내야** 한다. 지금 구조로는 서버가 "방금 뭘 물어봤는지"를 기억하지 못한다.
- nginx `/ai/` 라우팅이 `proxy_read_timeout 60s`로 걸려있어(§2.1), 클라이언트 쪽 타임아웃도 이보다
  여유 있게(예: 65~70초) 잡아야 조기 타임아웃을 피할 수 있다.

**⚠️ 발견된 이슈 — 사용자 JWT가 프롬프트 텍스트에 그대로 삽입되어 외부(Google) API로 전송됨**
`flow.js`의 `ai.generate()` 호출에서 `prompt: `[authToken: ${authToken}]\n\n환자 질문: ${message}``처럼,
로그인한 환자 본인의 **살아있는 JWT(만료까지 최대 12시간)를 프롬프트 문자열 안에 평문으로 끼워
Gemini API(Google)에 전송**한다. tool 호출 시 모델이 이 값을 그대로 인자에 채워 넣도록 지시문으로만
통제하고 있는데, 이 방식은 (1) 토큰이 제3자 API 로그/컨텍스트에 노출될 가능성, (2) 프롬프트 인젝션으로
모델이 답변 텍스트 안에 토큰 값을 그대로 출력해버릴 이론적 가능성을 열어둔다. 토큰 자체를 모델
프롬프트에 노출하지 않고, tool 실행 계층(코드)에서 서버가 별도로 보관한 세션 컨텍스트로 주입하는
방식이 더 안전하다.

---

## 6. AI 서빙 3종 (GCP Cloud Run, GPU/CPU 분리)

### 6.1 `mosec-serving` — 조직형 분류 + 유전자변이 예측 (GPU, L4 1개)

**모델 로딩 (`LungCDSSWorker.__init__`, 컨테이너 기동 시 1회)**
- GCS에서 두 세트의 가중치/설정 다운로드: AMD-MIL 분류 모델(`amd_mil_100test_best.pt`) +
  다중라벨 유전자예측 모델(`multilabel_amd_mil_weights.pt`), 둘 다 config JSON으로 하이퍼파라미터
  (embed_dim/agent_num/num_heads 등) 로드 후 `state_dict` 적용.
- UNI2-h(병리 특화 파운데이션 임베딩 모델)도 함께 로드(`feature_extraction.load_uni2h()`).

**추론 파이프라인 (`forward()`, 요청 1건당)**

```
1. GCS에서 슬라이드(.svs) 로컬 다운로드
2. update_step(case_id, "preprocessing") → Django에 X-Internal-Token으로 콜백
3. openslide로 조직 영역 패치 좌표 추출 (get_tissue_patch_coords)
4. update_step("feature_extraction") → UNI2-h로 패치들을 임베딩(bag_features)
5. update_step("classification")
   → AMD-MIL 분류 모델: softmax로 LUAD/LUSC 확률 + attention map
   → 유전자예측 모델: 같은 UNI2-h 임베딩(x)을 재사용해 TP53/KEAP1/KRAS 시그모이드 확률
     (임베딩 재추출 없이 모델 2개가 같은 특징을 공유 — 연산량 절약)
6. update_step("nuclei_detection")
   → attention 상위 5개 패치 추출 → 패치별로 핵 분할(segment_nuclei) + 오버레이 이미지 생성
   → 원본/오버레이 패치를 각각 GCS 업로드
7. update_step("generating_result")
   → 히트맵(attention 기반) 생성 후 GCS 업로드
   → 핵밀도/이형성 요약 통계(summarize_nuclei_metrics) 계산
8. 결과 dict 반환 — Django의 predict_case()가 그대로 받아 AIAnalysisResult 등에 저장
```

- `Server.append_worker(..., num=1, max_batch_size=1, max_wait_time=10, timeout=900)` —
  **워커가 딱 1개**라서 동시에 여러 케이스를 분석하면 뒤 요청은 GPU 워커가 비기 전까지 큐에서
  대기한다. Cloud Run 자체도 `max-instances=1`로 고정돼 있어 인스턴스 확장으로 이 병목을 우회할
  수도 없음 — 여러 병리사가 거의 동시에 "AI 추론 실행"을 누르면 자연스럽게 순차 처리된다.

**⚠️ 발견된 이슈 — GCS 다운로드/업로드에 timeout 설정이 전혀 없음**
`mosec-serving/gcs_utils.py`의 `download_slide_from_gcs()`/`upload_image_to_gcs()`/
`download_model_file_from_gcs()` 전부 `google-cloud-storage` 클라이언트의 기본 재시도/타임아웃
정책에 완전히 의존하고 있고, 코드에서 `timeout=` 인자를 명시적으로 준 곳이 한 곳도 없다. 인수인계
문서에 있던 "같은 160MB 파일인데 성공/실패가 갈리는 간헐적 멈춤" 현상의 유력한 원인으로 보인다 —
네트워크 상태가 나쁘거나 GCS 쪽에서 응답이 느려지면 무한정 가깝게 대기할 수 있고, 이 대기는 mosec
서버의 유일한 GPU 워커를 계속 점유한 채로 이뤄지므로 이후 모든 요청이 함께 밀린다. `download_to_filename`/
`upload_from_file` 호출에 `timeout=(연결초, 응답초)` 튜플을 명시하고, 상위(Django `call_mosec_predict`)
타임아웃(900s)보다 반드시 짧게 잡아야 "GCS 단계에서 멈춤"과 "mosec 자체가 느림"을 구분해 진단할 수 있다.

### 6.2 `thumbnail-serving` — CPU 전용, 완전히 분리된 별도 서비스

- GPU 모델(UNI2-h, AMD-MIL)을 전혀 로드하지 않는 경량 워커 — mosec-serving과 코드는 비슷한 패턴
  (openslide로 슬라이드 열기 → 썸네일 렌더링)이지만 완전히 별개의 Cloud Run 서비스로 배포되어,
  "업로드 직후 미리보기"처럼 GPU가 필요 없는 요청까지 GPU 인스턴스를 깨우지 않도록 분리해둔 설계.
- `finally` 블록에서 `slide.close()` + 로컬 임시파일 삭제를 보장 — 리소스 정리는 mosec-serving보다
  꼼꼼하게 되어 있음(mosec 쪽 `forward()`는 예외 발생 시 `slide.close()`/`os.remove()`가 스킵될 수 있는
  구조 — try/finally가 아님).
- Cloud Run 설정에 `--concurrency=1` — 인스턴스 1개가 동시에 요청 1건만 처리(CPU 바운드 작업 특성상
  자연스러운 선택), `max-instances=3`이라 최대 3건까지는 병렬 처리 가능.

### 6.3 `treatment-serving` — MedGemma-4B-it (vLLM, GPU L4 1개)

- 베이스 이미지 `vllm/vllm-openai:v0.8.3` 그대로 사용, 빌드 시 `--mount=type=secret,id=hf_token`으로
  허깅페이스 토큰을 시크릿으로만 주입해 모델 가중치를 이미지에 미리 다운로드(`snapshot_download`) —
  런타임에 매번 다운로드하지 않고 이미지 자체에 굽는 방식이라 콜드스타트 시간을 어느 정도 줄여둠(그래도
  §2.3에서 본 것처럼 200초 이상 걸림 — vLLM 엔진 초기화·torch.compile·CUDA 그래프 캡처 자체가 오래 걸림).
- 실행 옵션: `--max-model-len 4096`, `--gpu-memory-utilization 0.7`, `--enforce-eager`(CUDA 그래프
  캡처를 일부 건너뛰어 초기화는 빠르게 하되 추론 속도는 약간 손해), `--disable-log-stats`.
- OpenAI 호환 `/v1/chat/completions` 엔드포인트를 그대로 사용하므로 `rag/medgemma_client.py`가
  표준 OpenAI SDK 스타일 payload로 호출.


---

## 7. 핵심 데이터 흐름 요약 (End-to-End)

### 7.1 케이스 업로드 → AI 분석 → 의사 판독 → 환자 열람

```
[React 웹, 병리사]
  POST /api/cases/  (specimen_id, slide_gcs_path, patient_id)
    → Case(status=uploaded) 생성 + 동기로 썸네일 생성(call_mosec_thumbnail)

  POST /api/cases/{id}/predict/
    → Case.status = processing
    → call_mosec_predict()  ──900s──▶  [mosec-serving, GPU]
                                          슬라이드 다운로드 → UNI2-h 임베딩
                                          → AMD-MIL 분류 + 유전자예측 모델
                                          → 히트맵/핵패치 생성 → GCS 업로드
                                          (각 단계마다 update_case_step 콜백)
    ← {luad_prob, lusc_prob, gene_predictions, heatmap_path, nuclei_patches, ...}

    → generate_treatment_note(gene_predictions)
        → FAISS 검색(5개 PDF) → 근거 direct/co_mutation/excluded 분류
        → call_medgemma()  ──900s──▶  [treatment-serving, GPU, vLLM]
        ← treatment_note (2·3번 섹션만 LLM 생성, 나머지는 코드로 고정 조립)

    → transaction.atomic(): AIAnalysisResult + NucleiPatch×5 + GenePrediction×3 저장
    → Case.status = pending_review
    → notify(병리사, "AI 분석 완료") + notify(전체 활성 의사, "검토 대기 케이스")

[Flutter 의료진 앱, 의사]
  POST /api/cases/{id}/review/  (action: confirm | edit | reject)
    → ConfirmedFinding 생성 (action≠reject) + CaseReviewLog 기록
    → Case.status = confirmed  (reject면 rejected로 종료, 재분석 자동트리거 없음)
    → notify(환자, "검사결과가 공개되었습니다")

[Flutter 환자 앱]
  GET /api/cases/my-results/
    → status=confirmed AND confirmed_finding 존재하는 케이스만 (미확정은 완전 비노출)
```

### 7.2 실시간 채팅 (의사↔간호사)

```
[Flutter 의료진 앱] ──ws://.../ws/chat/{thread_id}?token=JWT──▶ [nginx /ws/] ──▶ [realtime-service]
                                                                                    │
                              require_ws_token(JWT) 검증 ─────────────────────────┘
                                                                                    │
                              메시지 수신 시 Django REST 내부 호출 ─────────────────▶ [backend]
                                POST /api/communication/threads/{id}/messages/       │
                                  → Message 저장, @멘션 파싱, notify() 로 알림+FCM   │
                              ◀──────────────────────────────────────────────────────┘
                              저장된 메시지를 Redis "chat:{thread_id}" 채널에 publish
                                                                                    │
                              그 채널을 구독 중인 모든 FastAPI 워커가 각자의 ─────────┘
                              WebSocket 클라이언트에게 relay (Pub/Sub이 멀티워커를 커버)
```

### 7.3 AI 챗봇 (환자 전용)

```
[Flutter 환자 앱] ──POST /ai/chat {message}──▶ [nginx /ai/] ──▶ [genkit-service]
                                                                    │
                    JWT 검증(HS256) 후 chatFlow({message, authToken})
                                                                    │
                    Gemini(2.5-flash)가 질문을 보고 tool 선택 ───────┤
                      개인데이터 3종(MCP, stdio) ──▶ mcpServer.js ──▶ Django REST (authToken으로 본인 데이터만)
                      일반지식 1종(네이티브 tool) ──▶ realtime-service /internal/rag/search ──▶ FAISS(5개 PDF)
                                                                    │
                    tool 결과를 바탕으로 최종 답변 생성(참고정보 안내 문구 필수 포함)
```

---

## 8. 발견된 이슈 종합 (심각도순)

| # | 위치 | 이슈 | 영향 |
|---|---|---|---|
| 1 | `accounts/views.py` `register_device_token()` | `django.db.transaction` import 누락, `transaction.atomic()` 사용 | 호출 시 `NameError`로 500 추정 — FCM 토큰 등록/갱신 자체가 막힐 가능성 |
| 2 | `infra/nginx/nginx.conf` | `/admin/`, `/static/` location 블록 없음 | Django Admin 접속 시 404 가능성 (과거에 고쳤다는 기록과 현재 저장소 상태 불일치) |
| 3 | `treatment-serving` Cloud Run 배포(`--timeout=300`) vs `medgemma_client.py`/nginx(900s) | 계층 간 타임아웃 불일치, 콜드스타트+생성시간이 300s를 넘기면 Cloud Run이 먼저 요청을 끊음 | "AI 소견 생성이 느리다/실패한다" 증상의 핵심 원인으로 추정 |
| 4 | `mosec-serving/gcs_utils.py` | GCS 다운로드/업로드 전부에 `timeout` 미설정 | 인수인계 문서의 "간헐적 멈춤" 미해결 이슈의 유력한 원인 |
| 5 | `cases/views.py` `predict_case` | gunicorn 워커(3개, WSGI 동기)가 최대 900s+900s를 뷰 함수 안에서 그대로 블로킹 | 동시에 여러 병리사가 분석을 실행하면 서버 전체 응답 불능 위험 |
| 6 | `mosec-serving` | `Server.append_worker(num=1, ...)` + Cloud Run `max-instances=1` | GPU 추론이 완전히 직렬화됨 — 동시 분석 요청은 큐잉만 되고 확장 불가 |
| 7 | `genkit-service/flow.js` | 사용자 JWT를 프롬프트 문자열에 평문 삽입해 Gemini API로 전송 | 토큰이 제3자 컨텍스트에 노출, 프롬프트 인젝션으로 토큰 유출될 이론적 가능성 |
| 8 | `medications/tasks.py` `check_medication_compliance` | 재발송 억제 필드 없음 — `taken=True`가 될 때까지 매시간 동일 알림 반복 | 알림 피로도 증가, 중요 알림(RED 증상체크 등)이 묻힐 위험 |
| 9 | `config/settings.py` | `DEBUG = True`가 하드코딩(운영 배포용 설정 파일에), `ALLOWED_HOSTS`에 운영 도메인이 이미 있는데도 DEBUG가 꺼져있지 않음 | 예외 발생 시 스택트레이스·환경변수 등이 응답에 노출될 위험 |
| 10 | `config/settings.py` `CORS_ALLOWED_ORIGINS` | `http://localhost:5173`만 등록, 운영 프론트 도메인 없음 | 현재는 nginx가 같은 origin으로 프록시해 문제 없어 보이나, 프론트가 다른 도메인/포트에서 직접 호출하게 되면 CORS 차단됨 |
| 11 | 과거 인수인계 문서 vs 현재 코드 | "Django Channels + Redis"로 기록되어 있으나 실제로는 FastAPI(ASGI) + Redis Pub/Sub 별도 서비스로 구현됨 | 문서와 실제 아키텍처 불일치 — 새로 합류하는 팀원이 혼란을 겪을 수 있음 |
| 12 | `cases/views.py` `review_case` action=`reject` | 케이스가 `rejected`로 종료된 뒤 재분석을 트리거하는 명시적 API 없음 | `predict_case`를 다시 호출하면 될 것으로 보이나, `Case.status` 가드가 `processing`만 막고 있어 실제 재시도 흐름이 문서화/검증되어 있지 않음 |
| 13 | `communication/serializers.py` `ChatThreadSerializer.get_unread_count` | 읽음추적 테이블이 없어 `unread_count`가 항상 `0` 고정 반환 | 프론트에서 안읽음 배지 UI를 이 필드로 만들면 항상 0으로만 보임 — 필요하면 읽음추적 모델 신규 추가가 선행돼야 함 |

---

## 9. 앱별 파일 위치 빠른 참조

```
backend/
├── config/          settings.py, urls.py(라우팅 최상위), celery.py, asgi.py, wsgi.py
├── core/             responses.py(에러포맷), exceptions.py(전역 핸들러) — 모델 없음
├── accounts/         User/PatientAuth/StaffAuth/*Profile/DeviceToken/GuardianLink 등 11개 모델
├── cases/            Case/AIAnalysisResult/ConfirmedFinding 등 8개 모델 + services.py(mosec 호출)
├── rag/               MedGemma+FAISS 소견생성 (Django 앱 아님, cases가 import)
├── symptoms/         SymptomCheck + rules.py(위험도 룰엔진)
├── medications/      MedicationSchedule/Log + tasks.py(Celery)
├── appointments/     Appointment + tasks.py(Celery, D-7/D-1 알림)
├── intake/            IntakeForm(JSON 자유스키마)
└── communication/    ChatThread/Message/Notification + services.py(notify 공통함수) + firebase.py

realtime-service/app/   main.py, auth.py, chat.py(WS 릴레이), internal_rag.py
genkit-service/src/     index.js(Express), flow.js(Genkit 오케스트레이션), mcpServer.js(MCP tool 3종)
mosec-serving/          server.py(추론 엔트리) + model.py/gene_model.py/feature_extraction.py 등
thumbnail-serving/      server.py(CPU 전용 썸네일)
treatment-serving/      Dockerfile만 (vLLM 표준 이미지 + MedGemma 가중치 사전 다운로드)
infra/                  docker-compose.yml, nginx/nginx.conf
.github/workflows/      deploy-vm.yml, deploy-mosec.yml, deploy-thumbnail.yml, deploy-treatment.yml
```

---

*이 문서는 저장소를 직접 클론해서 코드를 읽고 작성했습니다 (커밋 시점: 문서 작성일 기준 `main` 브랜치 HEAD).
이후 코드가 바뀌면 특히 8장의 이슈 목록은 재검증이 필요합니다.*
