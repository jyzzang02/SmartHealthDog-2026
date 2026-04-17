# 🐶 SmartHealthDog AI Model (AI 진단 서비스)

본 디렉토리는 **똑똑하개 건강하개 애플리케이션**에서 사용하는  
AI 기반 반려동물 질병 진단 모델 서버입니다.

---
## 📌 1. 프로젝트 구조

```
AI-model/
├── smart_health_dog_disease_detection.py
├── smart_health_dog_config.py
├── urine_analysis.py
├── test.py
├── dog_models/
├── cat_models/
├── requirements-cv2.t
├── requirements-local.txt
├── requirements-dev.txt
├── .env.example
└── .gitignore
```

---

## ⚙️ 2. 환경 설정

### 2.1 Git 클론

```bash
git clone https://github.com/jyzzang02/SmartHealthDog-2026.git
cd SmartHealthDog-2026/AI-model
```
---

### 2.2 가상환경 생성 및 활성화

```bash
python -m venv venv
```
# Windows
```bash
source venv/Scripts/activate
```

# Linux (치타)
```bash
source venv/bin/activate
```
---

### 2.3 패키지 설치

#### 로컬 (Windows)

```bash
pip install -r requirements-local.txt
pip install -r requirements-dev.txt
```

#### 치타 서버 (GPU)

```bash
pip install -r requirements-cv2.txt
pip install -r requirements-dev.txt
```

---

## 🔑 3. 환경 변수 설정

### 3.1 .env 파일 생성

```bash
cp .env.example .env
```

또는

```bash
nano .env
```

---

### 3.2 환경 변수 입력

```env
AI_MODEL_SERVICE_EMAIL=
AI_MODEL_SERVICE_PASSWORD=

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

AI_MODEL_SERVICE_EYE_UPDATE_ENDPOINT=
AI_MODEL_SERVICE_URINE_UPDATE_ENDPOINT=
AI_MODEL_SERVICE_STATUS_UPDATE_ENDPOINT=
AI_MODEL_SERVICE_LOGIN_ENDPOINT=
```

---

## ⚠️ 주의사항

- `.env` 파일은 Git에 포함하지 않습니다
- 코드에서 dotenv로 자동 로딩됩니다

---

## 🧠 4. 모델 파일 배치 (필수)

모델 파일(.pkl)은 Git에 포함되지 않습니다.

```
AI-model/
├── dog_models/*.pkl
├── cat_models/*.pkl
```

---

## 🧪 5. 테스트 실행

```bash
python test.py
```

---

## 🧰 6. Redis 실행

```bash
redis-server
```

확인:

```bash
redis-cli ping
```

→ PONG 나오면 정상

---

## 🚀 7. Celery 실행

```bash
celery -A smart_health_dog_disease_detection worker -l info -c 1
```

---

## ⚠️ 중요 사항

- 모델 경로 (./dog_models, ./cat_models) 변경 금지
- .env 없으면 인증 실패
- Redis 실행 안 하면 Celery 동작 안 함
- GPU 환경에서는 cpu=False 사용

---

## 📦 개발 환경

| 구분 | 설명 |
|------|------|
| 로컬 | Windows + CPU |
| 서버 | CHEETAH + GPU |
| 큐 | Redis |
| 처리 | Celery |

---

## ✅ 실행 순서 요약

1. clone
2. venv 생성
3. requirements 설치
4. .env 설정
5. 모델 파일 배치
6. Redis 실행
7. Celery 실행

