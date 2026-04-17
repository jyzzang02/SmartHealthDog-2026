# 🐶 SmartHealthDog AI Model (AI 진단 서비스)

본 디렉토리는 **똑똑하개 건강하개 애플리케이션**에서 사용하는  
AI 기반 반려동물 질병 진단 모델 서버입니다.

Celery 기반 워커로 동작하며,  
Backend와 통신하여 안구 질환 및 소변 분석 결과를 전달합니다.

---

# 📌 1. 프로젝트 구조
AI-model/
├── smart_health_dog_disease_detection.py # Celery 워커 (핵심)

├── smart_health_dog_config.py # 환경설정 (.env 로딩)

├── urine_analysis.py # 소변 분석 로직

├── test.py # 테스트 코드 (GPU 사용)

│
├── dog_models/ # 개 모델 (서버에 별도 배치)
├── cat_models/ # 고양이 모델 (서버에 별도 배치)
│
├── requirements-cv2.txt # 치타 서버용
├── requirements-local.txt # 로컬 테스트용
├── requirements-dev.txt # 실험/개발용
│
├── .env.example # 환경변수 템플릿
└── .gitignore

---

# ⚙️ 2. 환경 설정

## 2.1 Git 클론

```bash
git clone https://github.com/jyzzang02/SmartHealthDog-2026.git
cd SmartHealthDog-2026/AI-model


## 2.2 가상환경 생성 및 활성화

```bash
python -m venv venv

# Windows
source venv/Scripts/activate

# Linux (치타)
source venv/bin/activate

## 2.3 패키지 설치
<로컬환경>
```bash
pip install -r requirements-local.txt
pip install -r requirements-dev.txt

<치타서버(GPU)>
```bash
pip install -r requirements-cv2.txt
pip install -r requirements-dev.txt
