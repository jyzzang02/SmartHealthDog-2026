# Google Vision 이미지 OCR 연동 명세 (AI 담당)

**기준:** 최초 제공된 `ai.zip`의 기존 Worker 구조를 유지하고 OCR 모듈만 추가. **상태:** Google Vision OCR 모듈 및 예외 처리 구현 완료, 오프라인 단위 테스트 및 실제 Google Cloud OCR 호출 테스트 완료, GitHub main 브랜치 반영 완료. Backend/Celery 연동 전.

## 1. 책임 범위
- AI: 입력 이미지 바이트 검증, Google Vision DOCUMENT_TEXT_DETECTION, rawText 및 표준 오류 반환
- 기존 Worker 담당/Backend와 협의: Celery 태스크 정의, 이미지 URL/S3 다운로드, Backend 결과 전달, Submission 상태 업데이트, 재시도 정책
- OCR 모듈은 기존 `smart_health_dog_disease_detection.py`, `smart_health_dog_config.py`를 **수정하지 않음**.

## 2. 사용법
- 설치: `python -m pip install -r requirements-ocr.txt`
- 로컬 인증: `GOOGLE_APPLICATION_CREDENTIALS` 환경변수 또는 서버의 Application Default Credentials
- 실사용 호출: `from google_vision_ocr import extract_text; result = extract_text(image_bytes)`
- 로컬 수동 테스트: `python test_google_vision.py health_check_test.png`
- 오프라인 테스트: `python -m unittest test_google_vision_unit -v`

## 3. OCR 함수 계약
`extract_text(image_bytes: bytes, *, client=None, timeout=60) -> dict`

입력: JPEG/PNG/WEBP/TIFF/BMP/GIF 이미지 바이트. 프로젝트 자체 제한 기본 20MiB (`OCR_MAX_IMAGE_BYTES`로 변경 가능). PDF는 미지원. 이미지 파일 구조는 Pillow `verify()`로 검사하지만 완전한 콘텐츠 보증은 아님.

성공 예시:
```json
{"success": true, "rawText": "건강검진 결과\n검사일자 ...", "error": null}
```
실패 예시:
```json
{"success": false, "rawText": null, "error": "NO_TEXT_DETECTED"}
```

오류 코드: `INVALID_IMAGE`(빈/손상/비바이트 입력), `UNSUPPORTED_FORMAT`(예: PDF), `IMAGE_TOO_LARGE`(크기 초과), `NO_TEXT_DETECTED`(미검출), `OCR_AUTH_ERROR`(인증/권한), `OCR_TIMEOUT`(호출 시간 초과), `OCR_RATE_LIMIT`(할당량/속도 제한), `OCR_SERVICE_ERROR`(기타 서비스 오류).

Google Vision 설정: `document_text_detection`, 언어 힌트 `ko`, `en`, 요청 timeout 기본 60초. 반환되는 텍스트는 줄바꿈 포함 전체 문자열이며 필드별 구조화는 하지 않음. 응답에 오류가 있을 경우 API 제공자 오류 메시지 자체는 노출하지 않음.

## 4. 기존 Worker에 맞춘 연동 제안 (아직 미구현)
기존 `smart_health_dog_disease_detection.py`의 Celery 패턴을 참고하여 `image_url`, `submission_id`를 전달받는 **별도 OCR Celery 태스크**를 Worker 담당자와 협의 후 등록한다.

Frontend 이미지 업로드 → Backend 이미지 저장 → Celery 작업 등록 → Worker 이미지 다운로드 → `extract_text(image_bytes)` → Backend OCR 결과 수신 API → DB 저장 및 Submission 상태 갱신.

**주의**: 기존 Worker의 Celery 큐 이름, 결과 전송 API URL, DTO, 성공/실패 상태, 재시도 횟수, 이미지 URL의 접근 권한은 확인·확정 필요. 현재 OCR 코드에는 네트워크 이미지 다운로드/업로드, S3, Redis, Celery, Backend HTTP 호출이 포함되지 않는다.

제안 작업 입력:
```json
{"image_url": "https://example.invalid/document.png", "submission_id": "123"}
```
제안 Backend 결과 데이터 (확정 아님):
```json
{"submissionId": "123", "success": true, "rawText": "건강검진 결과 ...", "error": null}
```

## 5. 보안/운영
- 서비스 계정 JSON 키, `.env`, 환자 이미지/추출 텍스트는 Git/Notion에 업로드하지 않는다.
- 서버에서는 안전한 Google Cloud 인증 방식(가능하면 Workload Identity / ADC) 사용.
- Google Cloud Vision API 사용을 위해 서버 환경의 API 활성화, 결제 설정 및 인증 권한을 확인해야 한다.
- OCR 실패와 텍스트 오인식은 별개다. `success=true`는 문자열 추출 성공이지 90% 정확도 달성을 보증하지 않는다.
- 호출 비용, 요청 제한, 파일 크기, 서버 타임아웃 및 재시도 정책은 Backend와 협의한다.

## 6. 검증 상태
- Google Vision OCR을 이용한 실제 이미지 텍스트 추출 테스트 성공.
- 이미지 유효성 검사 및 예외 처리 구현 완료.
- 빈 이미지, 손상된 이미지, 지원하지 않는 형식, 이미지 크기 초과, 텍스트 미검출에 대한 예외 처리 구현.
- Google Cloud 인증 오류, 요청 시간 초과, API 호출량 제한 및 기타 서비스 오류에 대한 예외 처리 구현.
- Mock 기반 오프라인 단위 테스트 통과.
- Google Vision OCR 관련 코드 GitHub main 브랜치 업로드 완료.
- 기존 AI Worker 코드는 수정하지 않았으며, Backend/Celery 연동은 미구현 상태.
- 다양한 병원 양식 및 저화질 이미지에 대한 정량적 정확도 평가와 Backend/Celery 통합 테스트는 추후 진행 필요.
