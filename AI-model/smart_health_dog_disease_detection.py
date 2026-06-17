from fastai.vision.all import *
from celery import Celery
from urine_analysis import check_urine
import smart_health_dog_config
import requests
from io import BytesIO
import logging
import os
import hashlib
import numpy as np


def calculate_file_md5(file_path: str, chunk_size: int = 4096) -> str | None:
    if not os.path.isfile(file_path):
        logging.error(f"File not found: {file_path}")
        return None

    md5_hash = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                md5_hash.update(byte_block)
        return md5_hash.hexdigest()
    except IOError as e:
        logging.error(f"Error reading file {file_path}: {e}")
        return None


# ============================================================================
# 모델 정의
# ============================================================================

# 개: 단일 모델 10종 (B4, CrossEntropyLoss)
DOG_MODELS_NAMES = {
    "./dog_models/dog_blepharitis.pkl":             "Blepharitis",
    "./dog_models/dog_cataract.pkl":                "Cataract",
    "./dog_models/dog_conjunctivitis.pkl":           "Conjunctivitis",
    "./dog_models/dog_entropion.pkl":               "Entropion",
    "./dog_models/dog_eyelid_tumor.pkl":            "Eyelid_Tumor",
    "./dog_models/dog_epiphora.pkl":                "Epiphora",
    "./dog_models/dog_non_ulcerative_keratitis.pkl": "Non_ulcerative_Keratitis",
    "./dog_models/dog_nuclear_sclerosis.pkl":       "Nuclear_Sclerosis",
    "./dog_models/dog_pigmentary_keratitis.pkl":    "Pigmentary_Keratitis",
    "./dog_models/dog_ulcerative_keratitis.pkl":    "Ulcerative_Keratitis",
}

# 고양이: 단일 모델 3종 (B4, FocalLoss)
CAT_SINGLE_MODELS_NAMES = {
    "./cat_models/cat_conjunctivitis.pkl":  "Conjunctivitis",
    "./cat_models/cat_corneal_scapula.pkl": "Corneal_Scapula",
    "./cat_models/cat_corneal_ulcer.pkl":   "Corneal_Ulcer",
}

# 고양이: KFold 앙상블 2종 (B4, FocalLoss, 5-Fold)
# 추론 시 5개 모델 예측을 평균냄
CAT_KFOLD_MODELS_NAMES = {
    "Blepharitis": [
        f"./cat_models/cat_blepharitis_fold{i}.pkl" for i in range(1, 6)
    ],
    "Non_ulcerative_Keratitis": [
        f"./cat_models/cat_non_ulcerative_keratitis_fold{i}.pkl" for i in range(1, 6)
    ],
}

# ============================================================================
# 모델 로드
# ============================================================================

DOG_MODELS: dict[str, Learner] = {
    name: load_learner(path)
    for path, name in DOG_MODELS_NAMES.items()
}
DOG_MODELS_HASHES: dict[str, str | None] = {
    name: calculate_file_md5(path)
    for path, name in DOG_MODELS_NAMES.items()
}

CAT_SINGLE_MODELS: dict[str, Learner] = {
    name: load_learner(path)
    for path, name in CAT_SINGLE_MODELS_NAMES.items()
}
CAT_SINGLE_MODELS_HASHES: dict[str, str | None] = {
    name: calculate_file_md5(path)
    for path, name in CAT_SINGLE_MODELS_NAMES.items()
}

# KFold 모델: {disease_name: [Learner, ...]}
CAT_KFOLD_MODELS: dict[str, list[Learner]] = {
    name: [load_learner(path) for path in paths]
    for name, paths in CAT_KFOLD_MODELS_NAMES.items()
}
# KFold 해시: fold별 첫 번째 모델 해시를 대표값으로 사용
CAT_KFOLD_MODELS_HASHES: dict[str, str | None] = {
    name: calculate_file_md5(paths[0])
    for name, paths in CAT_KFOLD_MODELS_NAMES.items()
}

logging.info(f"Loaded {len(DOG_MODELS)} dog models: {list(DOG_MODELS.keys())}")
logging.info(f"Loaded {len(CAT_SINGLE_MODELS)} cat single models: {list(CAT_SINGLE_MODELS.keys())}")
logging.info(f"Loaded {sum(len(v) for v in CAT_KFOLD_MODELS.values())} cat kfold models: {list(CAT_KFOLD_MODELS.keys())}")

app = Celery("smart_health_dog_disease_detector")
app.config_from_object(smart_health_dog_config)


# ============================================================================
# 인증
# ============================================================================

def get_auth_token() -> str | None:
    try:
        logging.info(f"Attempting login to: {smart_health_dog_config.BACKEND_API_LOGIN_ENDPOINT}")
        response = requests.post(
            smart_health_dog_config.BACKEND_API_LOGIN_ENDPOINT,
            json={
                "email":    smart_health_dog_config.BACKEND_USERNAME,
                "password": smart_health_dog_config.BACKEND_PASSWORD,
            },
            timeout=10,
        )
        response.raise_for_status()

        token = response.json().get("accessToken")
        if not token:
            raise ValueError(f"'accessToken' not found in login response: {response.json()}")

        logging.info("Successfully obtained JWT token.")
        return token

    except Exception as e:
        logging.error(f"Login failed: {e}")
        return None


def _auth_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }


# ============================================================================
# 결과 제출
# ============================================================================

def submit_eye_results(submission_id: str, auth_token: str, results: dict):
    url = smart_health_dog_config.BACKEND_API_EYE_UPDATE_ENDPOINT.format(id=submission_id)
    try:
        logging.info(f"Submitting results to: {url}")
        response = requests.patch(
            url,
            json={"results": list(results.values())},
            headers=_auth_headers(auth_token),
            timeout=30,
        )
        response.raise_for_status()
        logging.info("Successfully submitted results.")
        return response.status_code
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit results: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None


def submit_urine_results(submission_id: str, auth_token: str, results: dict):
    url = smart_health_dog_config.BACKEND_API_URINE_UPDATE_ENDPOINT.format(id=submission_id)
    try:
        logging.info(f"Submitting urine results to: {url}")
        response = requests.patch(
            url,
            json={"results": results},
            headers=_auth_headers(auth_token),
            timeout=30,
        )
        response.raise_for_status()
        logging.info("Successfully submitted urine results.")
        return response.status_code
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit urine results: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None


def submit_status_update(
    submission_id:  str,
    auth_token:     str | None,
    status:         str,
    failure_reason: str | None = None,
):
    if not auth_token:
        logging.error(f"Cannot submit status update: no auth token (submission_id={submission_id}, status={status})")
        return None

    url     = smart_health_dog_config.BACKEND_API_STATUS_UPDATE_ENDPOINT.format(id=submission_id)
    payload = {"status": status}
    if failure_reason is not None:
        payload["failureReason"] = failure_reason

    try:
        logging.info(f"Submitting status update to: {url}, payload: {payload}")
        response = requests.patch(
            url,
            json=payload,
            headers=_auth_headers(auth_token),
            timeout=30,
        )
        response.raise_for_status()
        logging.info("Successfully submitted status update.")
        return response.status_code
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit status update: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None


# ============================================================================
# 이미지 다운로드
# ============================================================================

def _download_image(image_url: str) -> PILImage:
    try:
        response = requests.get(image_url, timeout=(10, 120))
        response.raise_for_status()
        return PILImage.create(BytesIO(response.content))
    except requests.exceptions.Timeout as e:
        raise TimeoutError(f"Image download timeout: {e}")
    except Exception as e:
        raise RuntimeError(f"Failed to download or decode image: {e}")


# ============================================================================
# 추론 헬퍼
# ============================================================================

def _predict_single(learn: Learner, img: PILImage) -> tuple[str, float]:
    """
    단일 Learner로 추론.
    반환: (pred_class, disease_probability)
    """
    pred_class, pred_idx, probs = learn.predict(img)

    if pred_class == "NoDisease":
        # NoDisease로 예측된 경우 Disease 확률 = 1 - NoDisease 확률
        disease_prob = float(1 - probs[pred_idx])
    else:
        disease_prob = float(probs[pred_idx])

    return pred_class, disease_prob


def _predict_kfold_ensemble(learners: list[Learner], img: PILImage) -> tuple[str, float]:
    """
    KFold 앙상블 추론: 각 fold의 softmax 확률을 평균내어 최종 예측 결정.
    반환: (pred_class, disease_probability)
    """
    all_probs = []
    disease_idx = None

    for learn in learners:
        _, pred_idx, probs = learn.predict(img)
        probs_np = probs.numpy()
        all_probs.append(probs_np)

        # vocab에서 Disease 인덱스 확정 (모든 fold 동일하므로 한 번만)
        if disease_idx is None:
            vocab = learn.dls.vocab
            disease_idx = vocab.o2i.get("Disease", 1)

    # fold 평균
    avg_probs    = np.stack(all_probs).mean(axis=0)
    pred_idx     = int(avg_probs.argmax())
    pred_class   = learn.dls.vocab[pred_idx]
    disease_prob = float(avg_probs[disease_idx])

    return pred_class, disease_prob


# ============================================================================
# 개 추론
# ============================================================================

def _run_dog_inference(image_url: str, submission_id: str) -> dict:
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed."}

    try:
        img = _download_image(image_url)
    except TimeoutError as e:
        logging.error(f"Image download timeout: {e}")
        submit_status_update(submission_id, token, "FAILED", "TIMEOUT")
        return {"error": str(e)}
    except Exception as e:
        logging.error(f"Image download failed: {e}")
        submit_status_update(submission_id, token, "FAILED", "INVALID_INPUT")
        return {"error": str(e)}

    results = {}
    try:
        for name, learn in DOG_MODELS.items():
            pred_class, disease_prob = _predict_single(learn, img)
            results[name] = {
                "disease":      name,
                "probability":  float(f"{disease_prob:.4f}"),
                "modelMd5Hash": DOG_MODELS_HASHES[name],
            }
            logging.info(f"[DOG] {name}: {pred_class} ({disease_prob:.4f})")

        submit_eye_results(submission_id, token, results)
        return results

    except Exception as e:
        logging.error(f"Dog prediction failed: {e}")
        submit_status_update(submission_id, token, "FAILED", "INVALID_INPUT")
        return {"error": str(e)}


# ============================================================================
# 고양이 추론 (단일 + KFold 앙상블 혼합)
# ============================================================================

def _run_cat_inference(image_url: str, submission_id: str) -> dict:
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed."}

    try:
        img = _download_image(image_url)
    except TimeoutError as e:
        logging.error(f"Image download timeout: {e}")
        submit_status_update(submission_id, token, "FAILED", "TIMEOUT")
        return {"error": str(e)}
    except Exception as e:
        logging.error(f"Image download failed: {e}")
        submit_status_update(submission_id, token, "FAILED", "INVALID_INPUT")
        return {"error": str(e)}

    results = {}
    try:
        # 단일 모델 추론
        for name, learn in CAT_SINGLE_MODELS.items():
            pred_class, disease_prob = _predict_single(learn, img)
            results[name] = {
                "disease":      name,
                "probability":  float(f"{disease_prob:.4f}"),
                "modelMd5Hash": CAT_SINGLE_MODELS_HASHES[name],
            }
            logging.info(f"[CAT][single] {name}: {pred_class} ({disease_prob:.4f})")

        # KFold 앙상블 추론
        for name, learners in CAT_KFOLD_MODELS.items():
            pred_class, disease_prob = _predict_kfold_ensemble(learners, img)
            results[name] = {
                "disease":      name,
                "probability":  float(f"{disease_prob:.4f}"),
                "modelMd5Hash": CAT_KFOLD_MODELS_HASHES[name],
            }
            logging.info(f"[CAT][kfold {len(learners)}] {name}: {pred_class} ({disease_prob:.4f})")

        submit_eye_results(submission_id, token, results)
        return results

    except Exception as e:
        logging.error(f"Cat prediction failed: {e}")
        submit_status_update(submission_id, token, "FAILED", "INVALID_INPUT")
        return {"error": str(e)}


# ============================================================================
# Celery Task
# ============================================================================

@app.task
def predict_dog_disease(image_url: str, submission_id: str):
    return _run_dog_inference(image_url, submission_id)


@app.task
def predict_cat_disease(image_url: str, submission_id: str):
    return _run_cat_inference(image_url, submission_id)


@app.task
def predict_urine_analysis(image_url: str, submission_id: str):
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed."}

    try:
        results = check_urine(image_url)

        if "error" in results:
            logging.error(f"Urine analysis failed: {results['error']}")
            submit_status_update(submission_id, token, "FAILED", "INFERENCE_ERROR")
            return results

        submit_urine_results(submission_id, token, results["results"])
        submit_status_update(submission_id, token, "COMPLETED")
        return results

    except requests.exceptions.Timeout as e:
        logging.error(f"Urine image download timeout: {e}")
        submit_status_update(submission_id, token, "FAILED", "TIMEOUT")
        return {"error": str(e)}

    except Exception as e:
        logging.error(f"Urine analysis exception: {e}")
        submit_status_update(submission_id, token, "FAILED", "INFERENCE_ERROR")
        return {"error": str(e)}