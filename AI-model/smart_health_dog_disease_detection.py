from fastai.vision.all import *
from celery import Celery
from urine_analysis import check_urine
import smart_health_dog_config
import requests
from io import BytesIO
import logging
import os
import hashlib


def calculate_file_md5(file_path: str, chunk_size: int = 4096) -> str | None:
    if not os.path.isfile(file_path):
        logging.error(f"File not found: {file_path}")
        return None
    md5_hash = hashlib.md5()
    try:
        with open(file_path, 'rb') as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                md5_hash.update(byte_block)
        return md5_hash.hexdigest()
    except IOError as e:
        logging.error(f"Error reading file {file_path}: {e}")
        return None


DOG_MODELS_NAMES = {
    "./dog_models/dog_blepharitis.pkl":           "Blepharitis",
    "./dog_models/dog_cataract.pkl":              "Cataract",
    "./dog_models/dog_conjunctivitis.pkl":        "Conjunctivitis",
    "./dog_models/dog_entropion.pkl":             "Entropion",
    "./dog_models/dog_eyelid_tumor.pkl":          "Eyelid Tumor",
    "./dog_models/dog_incontinence.pkl":          "Incontinence",
    "./dog_models/dog_non_ulcerative_keratitis.pkl": "Non-ulcerative Keratitis",
    "./dog_models/dog_nuclear_sclerosis.pkl":     "Nuclear Sclerosis",
    "./dog_models/dog_pigmentary_keratitis.pkl":  "Pigmentary Keratitis",
    "./dog_models/dog_ulcerative_keratitis.pkl":  "Ulcerative Keratitis",
}

CAT_MODELS_NAMES = {
    "./cat_models/cat_blepharitis.pkl":              "Blepharitis",
    "./cat_models/cat_conjunctivitis.pkl":           "Conjunctivitis",
    "./cat_models/cat_corneal_dystrophy.pkl":        "Corneal Dystrophy",
    "./cat_models/cat_corneal_ulcer.pkl":            "Corneal Ulcer",
    "./cat_models/cat_non_ulcerative_keratitis.pkl": "Non-ulcerative Keratitis",
}

DOG_MODELS = {name: load_learner(path) for path, name in DOG_MODELS_NAMES.items()}
DOG_MODELS_HASHES = {name: calculate_file_md5(path) for path, name in DOG_MODELS_NAMES.items()}

CAT_MODELS = {name: load_learner(path) for path, name in CAT_MODELS_NAMES.items()}
CAT_MODELS_HASHES = {name: calculate_file_md5(path) for path, name in CAT_MODELS_NAMES.items()}

logging.info(f"Loaded {len(DOG_MODELS)} dog models: {list(DOG_MODELS.keys())}")
logging.info(f"Loaded {len(CAT_MODELS)} cat models: {list(CAT_MODELS.keys())}")

app = Celery('smart_health_dog_disease_detector')
app.config_from_object(smart_health_dog_config)


def get_auth_token() -> str | None:
    try:
        logging.info(f"Attempting login to: {smart_health_dog_config.BACKEND_API_LOGIN_ENDPOINT}")
        response = requests.post(
            smart_health_dog_config.BACKEND_API_LOGIN_ENDPOINT,
            json={
                "email": smart_health_dog_config.BACKEND_USERNAME,
                "password": smart_health_dog_config.BACKEND_PASSWORD,
            },
            timeout=5,
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
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def submit_eye_results(submission_id: str, auth_token: str, results: dict):
    url = smart_health_dog_config.BACKEND_API_EYE_UPDATE_ENDPOINT.format(id=submission_id)
    try:
        logging.info(f"Submitting results to: {url}")
        response = requests.patch(url, json={"results": list(results.values())}, headers=_auth_headers(auth_token), timeout=5)
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
        response = requests.patch(url, json={"results": results}, headers=_auth_headers(auth_token), timeout=5)
        response.raise_for_status()
        logging.info("Successfully submitted urine results.")
        return response.status_code
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit urine results: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None


def submit_status_update(submission_id: str, auth_token: str | None, status: str, failure_reason: str | None = None):
    if not auth_token:
        logging.error(f"Cannot submit status update: no auth token (submission_id={submission_id}, status={status})")
        return None
    url = smart_health_dog_config.BACKEND_API_STATUS_UPDATE_ENDPOINT.format(id=submission_id)
    payload = {"status": status}
    if failure_reason is not None:
        payload["failureReason"] = failure_reason
    try:
        logging.info(f"Submitting status update to: {url}")
        response = requests.patch(url, json=payload, headers=_auth_headers(auth_token), timeout=5)
        response.raise_for_status()
        logging.info("Successfully submitted status update.")
        return response.status_code
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit status update: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None


def _download_image(image_url: str):
    response = requests.get(image_url, timeout=10)
    response.raise_for_status()
    return PILImage.create(BytesIO(response.content))


def _run_eye_inference(image_url: str, submission_id: str, models: dict, hashes: dict) -> dict:
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed."}

    try:
        img = _download_image(image_url)
    except Exception as e:
        logging.error(f"Failed to download image from {image_url}: {e}")
        submit_status_update(submission_id, token, "FAILED", "INFERENCE_ERROR")
        return {"error": str(e)}

    results = {}
    try:
        for name, learn in models.items():
            pred_class, pred_idx, probs = learn.predict(img)
            if pred_class == "NoDisease":
                pred_idx = 0
                probs[pred_idx] = 1 - probs[1]
            results[name] = {
                "disease": name,
                "probability": float(f"{probs[pred_idx]:.4f}"),
                "modelMd5Hash": hashes[name],
            }
        submit_eye_results(submission_id, token, results)
        return results
    except Exception as e:
        logging.error(f"Prediction failed: {e}")
        submit_status_update(submission_id, token, "FAILED", "INFERENCE_ERROR")
        return {"error": str(e)}


@app.task
def predict_dog_disease(image_url: str, submission_id: str):
    return _run_eye_inference(image_url, submission_id, DOG_MODELS, DOG_MODELS_HASHES)


@app.task
def predict_cat_disease(image_url: str, submission_id: str):
    return _run_eye_inference(image_url, submission_id, CAT_MODELS, CAT_MODELS_HASHES)


@app.task
def predict_urine_analysis(image_url: str, submission_id: str):
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed."}

    results = check_urine(image_url)
    if "error" in results:
        submit_status_update(submission_id, token, "FAILED", "INFERENCE_ERROR")
        return results

    submit_urine_results(submission_id, token, results["results"])
    submit_status_update(submission_id, token, "COMPLETED")
    return results
