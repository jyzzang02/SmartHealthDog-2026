# Google Vision 이미지 OCR 연동 명세 (AI 담당)

**기준:** 최초 제공된 `ai.zip`의 기존 Worker 구조를 유지하고 OCR 모듈만 추가. **상태:** OCR 코드 및 오프라인 단위 테스트 작성 완료, 실제 Google Cloud 호출 재검증 및 Backend/Celery 연동 전.

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

**주의:** 기존 Worker의 Celery 큐 이름, 결과 전송 API URL, DTO, 성공/실패 상태, 재시도 횟수, 이미지 URL의 접근 권한은 확인·확정 필요. 현재 OCR 코드에는 네트워크 이미지 다운로드/업로드, S3, Redis, Celery, Backend HTTP 호출이 포함되지 않는다.

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
- Google Cloud 프로젝트의 Vision API 활성화와 **결제 활성 상태**를 확인해야 한다. 이전 테스트에서 `BILLING_DISABLED` 오류가 관찰되었으므로 실서버 배포 전에 재검증한다.
- OCR 실패와 텍스트 오인식은 별개다. `success=true`는 **문자열 추출 성공**이지 90% 정확도 달성을 보증하지 않는다.
- 호출 비용, 요청 제한, 파일 크기, 서버 타임아웃 및 재시도 정책은 Backend와 협의한다.

## 6. 검증 상태
- 과거 원본 `test_google_vision.py`에서 로컬 API 호출 성공(단일 이미지 약 0.93초, 측정 시점 기준).
- 현재 배포 후보: OCR 함수·오류 처리·오프라인 단위 테스트 작성. **실제 Google Vision 호출은 사용자 로컬에서 재검증 필요**.
- Backend/Celery 통합 테스트, 다양한 양식 정확도 측정, GitHub push는 미완료.
