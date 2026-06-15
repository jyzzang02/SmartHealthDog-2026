import time
import logging
import os
import hashlib
import argparse
from pathlib import Path

import requests
from fastai.vision.all import *
from PIL import Image

# =========================
# Configuration
# =========================

TEST_IMAGE_DIR = os.getenv("TEST_IMAGE_DIR", "input")
INFERENCE_INTERVAL_SECONDS = int(os.getenv("INFERENCE_INTERVAL_SECONDS", "5"))

AI_MODEL_SERVICE_EMAIL = os.getenv("AI_MODEL_SERVICE_EMAIL", "ai-model@smarthealthdog.local")
AI_MODEL_SERVICE_PASSWORD = os.getenv("AI_MODEL_SERVICE_PASSWORD", "AiService1234!")

AI_MODEL_SERVICE_LOGIN_ENDPOINT = os.getenv(
    "AI_MODEL_SERVICE_LOGIN_ENDPOINT",
    "http://10.177.27.188:8088/api/auth/login"
)

AI_MODEL_SERVICE_EYE_UPDATE_ENDPOINT = os.getenv(
    "AI_MODEL_SERVICE_EYE_UPDATE_ENDPOINT",
    "http://10.177.27.188:8088/api/submissions/{id}/eye"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)


# =========================
# Utility
# =========================

def calculate_file_md5(file_path: str, chunk_size: int = 4096) -> str | None:
    if not os.path.isfile(file_path):
        return None

    md5_hash = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                md5_hash.update(byte_block)
        return md5_hash.hexdigest()
    except IOError:
        return None


def login_to_backend() -> str:
    payload = {
        "email": AI_MODEL_SERVICE_EMAIL,
        "password": AI_MODEL_SERVICE_PASSWORD,
    }

    logging.info(f"Logging in to backend: {AI_MODEL_SERVICE_LOGIN_ENDPOINT}")

    response = requests.post(
        AI_MODEL_SERVICE_LOGIN_ENDPOINT,
        json=payload,
        timeout=10
    )

    if response.status_code != 200:
        logging.error(f"Login failed. status={response.status_code}, body={response.text}")
        response.raise_for_status()

    data = response.json()
    access_token = data.get("accessToken")

    if not access_token:
        raise RuntimeError(f"accessToken not found in login response: {data}")

    logging.info("Backend login successful.")
    return access_token


def send_eye_results_to_backend(submission_id: str, prediction_results: dict, access_token: str):
    url = AI_MODEL_SERVICE_EYE_UPDATE_ENDPOINT.replace("{id}", str(submission_id))

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    # 백엔드 DTO가 정확히 다르면 여기 payload만 맞춰주면 됨
    payload = {
        "diagnoses": [
            {
                "disease": result["disease"],
                "probability": float(result["probability"]),
                "modelMd5Hash": result["modelMd5Hash"],
            }
            for result in prediction_results.values()
            if "error" not in result
        ]
    }

    logging.info(f"Sending eye results to backend: {url}")
    logging.info(f"Payload: {payload}")

    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=15
    )

    if response.status_code not in (200, 201, 204):
        logging.error(f"Result send failed. status={response.status_code}, body={response.text}")
        response.raise_for_status()

    logging.info(f"Eye results sent successfully. status={response.status_code}")


# =========================
# Model Setup
# =========================

DOG_MODELS_NAMES = {
    "./dog_models/dog_blepharitis.pkl": "Dog-Blepharitis",
    "./dog_models/dog_cataract.pkl": "Dog-Cataract",
    "./dog_models/dog_conjunctivitis.pkl": "Dog-Conjunctivitis",
    "./dog_models/dog_entropion.pkl": "Dog-Entropion",
    "./dog_models/dog_eyelid_tumor.pkl": "Dog-Eyelid Tumor",
    "./dog_models/dog_incontinence.pkl": "Dog-Incontinence",
    "./dog_models/dog_non_ulcerative_keratitis.pkl": "Dog-Non-ulcerative Keratitis",
    "./dog_models/dog_nuclear_sclerosis.pkl": "Dog-Nuclear Sclerosis",
    "./dog_models/dog_pigmentary_keratitis.pkl": "Dog-Pigmentary Keratitis",
    "./dog_models/dog_ulcerative_keratitis.pkl": "Dog-Ulcerative Keratitis",
}

CAT_MODELS_NAMES = {
    "./cat_models/cat_blepharitis.pkl": "Cat-Blepharitis",
    "./cat_models/cat_conjunctivitis.pkl": "Cat-Conjunctivitis",
    "./cat_models/cat_corneal_dystrophy.pkl": "Cat-Corneal Dystrophy",
    "./cat_models/cat_corneal_ulcer.pkl": "Cat-Corneal Ulcer",
    "./cat_models/cat_non_ulcerative_keratitis.pkl": "Cat-Non-ulcerative Keratitis",
}


try:
    DOG_MODELS = {
        name: load_learner(path, cpu=False)
        for path, name in DOG_MODELS_NAMES.items()
    }

    DOG_MODELS_HASHES = {
        name: calculate_file_md5(path)
        for path, name in DOG_MODELS_NAMES.items()
    }

    CAT_MODELS = {
        name: load_learner(path, cpu=False)
        for path, name in CAT_MODELS_NAMES.items()
    }

    CAT_MODELS_HASHES = {
        name: calculate_file_md5(path)
        for path, name in CAT_MODELS_NAMES.items()
    }

    ALL_MODELS = {**DOG_MODELS, **CAT_MODELS}
    ALL_MODELS_HASHES = {**DOG_MODELS_HASHES, **CAT_MODELS_HASHES}

    logging.info(f"Loaded {len(ALL_MODELS)} models successfully.")
    logging.info(f"All loaded models: {list(ALL_MODELS.keys())}")

except Exception as e:
    logging.error(f"Failed to load models. Check paths and fastai environment. Error: {e}")
    exit(1)


# =========================
# Inference
# =========================

def make_universal_prediction(img_path: Path):
    logging.info(f"Starting universal inference for: {img_path.name}")
    results = {}

    try:
        img = PILImage.create(img_path)
    except Exception as e:
        logging.error(f"Failed to load image {img_path.name}: {e}")
        return {"error": f"Image load failed for {img_path.name}"}

    for key, learn in ALL_MODELS.items():
        try:
            pred_class, pred_idx, probs = learn.predict(img)

            if pred_class == "NoDisease":
                pred_class = "Disease"
                pred_idx = 0
                probs[pred_idx] = 1 - probs[1]

            results[key] = {
                "disease": key,
                "probability": f"{float(probs[pred_idx]):.4f}",
                "modelMd5Hash": ALL_MODELS_HASHES.get(key),
            }

        except Exception as e:
            logging.error(f"Prediction failed for model={key}, image={img_path.name}: {e}")

    return results


# =========================
# Main
# =========================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--submission-id",
        required=True,
        help="Backend submissions.id value"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run only one inference cycle"
    )

    args = parser.parse_args()
    submission_id = args.submission_id

    all_image_paths = get_image_files(TEST_IMAGE_DIR)

    if not all_image_paths:
        logging.error(f"No image files found in '{TEST_IMAGE_DIR}'. Please add images.")
        exit(1)

    logging.info(f"Found {len(all_image_paths)} images to process.")

    access_token = login_to_backend()

    while True:
        start_time = time.time()

        logging.info("-" * 40)
        logging.info("STARTING NEW UNIVERSAL INFERENCE CYCLE")

        for img_path in all_image_paths:
            prediction_results = make_universal_prediction(img_path)

            if "error" in prediction_results:
                logging.error(f"Inference error for {img_path.name}: {prediction_results['error']}")
                continue

            logging.info(
                f"Inference complete for {img_path.name}. "
                f"Total {len(prediction_results)} predictions made."
            )

            send_eye_results_to_backend(
                submission_id=submission_id,
                prediction_results=prediction_results,
                access_token=access_token
            )

        cycle_duration = time.time() - start_time
        logging.info(f"Inference cycle took {cycle_duration:.2f} seconds.")

        if args.once:
            break

        logging.info(f"Sleeping for {INFERENCE_INTERVAL_SECONDS} seconds before next cycle...")
        time.sleep(INFERENCE_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()