from fastai.vision.all import *
from celery import Celery
from urine_analysis import check_urine
import smart_health_dog_config
import requests       # <-- ADD THIS IMPORT for fetching the image
from io import BytesIO  # <-- ADD THIS IMPORT for handling in-memory image data
import logging
import os
import hashlib

# Function to calculate MD5 hash of a file
def calculate_file_md5(file_path: str, chunk_size: int = 4096) -> str | None:
    """
    Calculates the MD5 hash of a file by reading it in chunks.

    :param file_path: Path to the file.
    :param chunk_size: Size of chunks to read (in bytes).
    :return: The 32-character hexadecimal MD5 hash string, or None if the file is not found.
    """
    if not os.path.isfile(file_path):
        logging.error(f"File not found: {file_path}")
        return None
        
    md5_hash = hashlib.md5()
    try:
        # Open in binary mode ('rb')
        with open(file_path, 'rb') as f:
            # Read and update hash in chunks
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                md5_hash.update(byte_block)
        return md5_hash.hexdigest()
    except IOError as e:
        logging.error(f"Error reading file {file_path}: {e}")
        return None


# --- Fastai Model Initialization (Global) ---

DOG_MODELS_NAMES = {
    "./dog_models/dog_blepharitis.pkl": "Blepharitis",
    "./dog_models/dog_cataract.pkl": "Cataract",
    "./dog_models/dog_conjunctivitis.pkl": "Conjunctivitis",
    "./dog_models/dog_entropion.pkl": "Entropion",
    "./dog_models/dog_eyelid_tumor.pkl": "Eyelid Tumor",
    "./dog_models/dog_incontinence.pkl": "Incontinence",
    "./dog_models/dog_non_ulcerative_keratitis.pkl": "Non-ulcerative Keratitis",
    "./dog_models/dog_nuclear_sclerosis.pkl": "Nuclear Sclerosis",
    "./dog_models/dog_pigmentary_keratitis.pkl": "Pigmentary Keratitis",
    "./dog_models/dog_ulcerative_keratitis.pkl": "Ulcerative Keratitis",
}

CAT_MODELS_NAMES = {
    "./cat_models/cat_blepharitis.pkl": "Blepharitis",
    "./cat_models/cat_conjunctivitis.pkl": "Conjunctivitis",
    "./cat_models/cat_corneal_dystrophy.pkl": "Corneal Dystrophy",
    "./cat_models/cat_corneal_ulcer.pkl": "Corneal Ulcer",
    "./cat_models/cat_non_ulcerative_keratitis.pkl": "Non-ulcerative Keratitis",
}

# Load all models once when the worker starts
# Use a dictionary comprehension to load models with their names as keys
# This dictionary will be available to all tasks in this worker process
DOG_MODELS = {
    DOG_MODELS_NAMES[model_path]: load_learner(model_path)
    for model_path in DOG_MODELS_NAMES.keys()
}

DOG_MODELS_HASHES = {
    DOG_MODELS_NAMES[model_path]: calculate_file_md5(model_path)
    for model_path in DOG_MODELS_NAMES.keys()
}

CAT_MODELS = {
    CAT_MODELS_NAMES[model_path]: load_learner(model_path)
    for model_path in CAT_MODELS_NAMES.keys()
}

CAT_MODELS_HASHES = {
    CAT_MODELS_NAMES[model_path]: calculate_file_md5(model_path)
    for model_path in CAT_MODELS_NAMES.keys()
}

logging.info(f"Loaded {len(DOG_MODELS)} dog models successfully.")
logging.info(f"Loaded models: {list(DOG_MODELS.keys())}")

logging.info(f"Loaded {len(CAT_MODELS)} cat models successfully.")
logging.info(f"Loaded models: {list(CAT_MODELS.keys())}")

# --- Celery Application Definition ---

# Initialize the Celery application
app = Celery('smart_health_dog_disease_detector')
# Load configuration from smart_health_dog_config.py
app.config_from_object(smart_health_dog_config)


# Function to obtain the JWT token
def get_auth_token() -> str:
    """Logs in to the backend and returns the JWT token."""
    login_url = smart_health_dog_config.BACKEND_API_LOGIN_ENDPOINT
    credentials = {
        "email": smart_health_dog_config.BACKEND_USERNAME,
        "password": smart_health_dog_config.BACKEND_PASSWORD
    }
    
    try:
        logging.info(f"Attempting login to: {login_url}")
        response = requests.post(login_url, json=credentials, timeout=5)
        response.raise_for_status() # Raise error for bad status codes
        
        # CORRECTED: Assuming the backend returns the token in a JSON field named 'accessToken'
        token = response.json().get("accessToken")
        if not token:
            # Added more context to the error message for easier debugging
            raise ValueError(f"Key 'accessToken' not found in login response: {response.json()}")
            
        logging.info("Successfully obtained JWT token.")
        return token
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Login failed: {e}")
        return None
    except Exception as e:
        logging.error(f"Error processing login response or token: {e}")
        return None

# Function to submit the prediction results back to the backend
def submit_eye_results(submission_id: str, auth_token: str, results: dict):
    """Submits the prediction results back to the backend."""
    submit_url = smart_health_dog_config.BACKEND_API_EYE_UPDATE_ENDPOINT.format(id=submission_id)
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "results": [result for result in results.values()]
    }
    
    try:
        logging.info(f"Submitting results to: {submit_url}")
        response = requests.patch(submit_url, json=payload, headers=headers, timeout=5)
        response.raise_for_status() # Raise error for bad status codes
        
        logging.info("Successfully submitted results.")
        return response.status_code
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit results: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None

def submit_urine_results(submission_id: str, auth_token: str, results: dict):
    """Submits the urine analysis results back to the backend."""
    submit_url = smart_health_dog_config.BACKEND_API_URINE_UPDATE_ENDPOINT.format(id=submission_id)
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "results": results
    }
    
    try:
        logging.info(f"Submitting urine analysis results to: {submit_url}")
        logging.info(f"Payload: {payload}")
        response = requests.patch(submit_url, json=payload, headers=headers, timeout=5)
        response.raise_for_status() # Raise error for bad status codes
        
        logging.info("Successfully submitted urine analysis results.")
        return response.status_code
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit urine analysis results: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None

def submit_status_update(submission_id: str, auth_token: str, status: str, message: str):
    """Submits a status update back to the backend."""
    submit_url = smart_health_dog_config.BACKEND_API_STATUS_UPDATE_ENDPOINT.format(id=submission_id)
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "status": status,
        "failureReason": message
    }
    
    try:
        logging.info(f"Submitting status update to: {submit_url}")
        response = requests.patch(submit_url, json=payload, headers=headers, timeout=5)
        response.raise_for_status() # Raise error for bad status codes
        
        logging.info("Successfully submitted status update.")
        return response.status_code
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to submit status update: {e}")
        logging.error(f"Error response: {response.text if 'response' in locals() else 'No response received'}")
        return None

# --- Celery Task Definition ---

@app.task
def predict_dog_disease(image_url: str, submission_id: str): 
    """
    Celery task to predict dog disease from an S3/CloudFront image URL.

    :param image_url: A string URL to the image file (e.g., CloudFront URL).
    :param submission_id: A string ID representing the submission.
    :return: A dictionary containing prediction results from all models.
    """
    
    # 1. Login to get auth token (if needed for further processing)
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed. Could not obtain JWT token."}

    # 2. Download the image from the URL
    img = None
    try:
        response = requests.get(image_url, timeout=10) # Set a timeout for the request
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
        
        # Load the image directly from the downloaded binary content
        img = PILImage.create(BytesIO(response.content))
    
    except Exception as e:
        logging.error(f"Failed to process downloaded image from {image_url}: {e}")
        submit_status_update(
            submission_id=submission_id, 
            auth_token=token, 
            status="FAILED", 
            message="이미지 손상으로 인해 진단에 실패했습니다. 다시 시도해주세요."
        )
        return {"error": f"Failed to process downloaded image from {image_url}: {e}"}

    # 3. Prepare results dictionary
    results = {}

    # 4. Predict with all loaded models
    try:
        for key, learn in DOG_MODELS.items():
            # predict() returns a tuple: (predicted_class, class_index, probabilities)
            pred_class, pred_idx, probs = learn.predict(img)

            # NoDisease가 더 높은 확률이라면 Disease로 변환하고, 확률을 1 - NoDisease로 설정
            if pred_class == "NoDisease":
                pred_class = "Disease"
                pred_idx = 0
                probs[pred_idx] = 1 - probs[1]

            # Store the result for this model
            results[key] = {
                "disease": key,
                "probability": f"{probs[pred_idx]:.4f}",
                "modelMd5Hash": DOG_MODELS_HASHES.get(key)
            }

        # 5. Return the results
        submit_eye_results(submission_id=submission_id, auth_token=token, results=results)
        return results
    except Exception as e:
        logging.error(f"Error during prediction: {e}")
        submit_status_update(
            submission_id=submission_id, 
            auth_token=token, 
            status="FAILED", 
            message="진단 중 오류가 발생했습니다. 다시 시도해주세요."
        )
        return {"error": f"Prediction failed: {e}"}

@app.task
def predict_cat_disease(image_url: str, submission_id: str): 
    """
    Celery task to predict cat disease from an S3/CloudFront image URL.

    :param image_url: A string URL to the image file (e.g., CloudFront URL).
    :param submission_id: A string ID representing the submission.
    :return: A dictionary containing prediction results from all models.
    """

    # 1. Login to get auth token (if needed for further processing)
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed. Could not obtain JWT token."}
    
    # 2. Download the image from the URL
    img = None
    try:
        response = requests.get(image_url, timeout=10) # Set a timeout for the request
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
        
        # Load the image directly from the downloaded binary content
        img = PILImage.create(BytesIO(response.content))
    
    except Exception as e:
        logging.error(f"Failed to process downloaded image from {image_url}: {e}")
        submit_status_update(
            submission_id=submission_id, 
            auth_token=token, 
            status="FAILED", 
            message="이미지 손상으로 인해 진단에 실패했습니다. 다시 시도해주세요."
        )
        return {"error": f"Failed to process downloaded image from {image_url}: {e}"}

    # 3. Prepare results dictionary
    results = {}

    try:
        # 4. Predict with all loaded models
        for key, learn in CAT_MODELS.items():
            # predict() returns a tuple: (predicted_class, class_index, probabilities)
            pred_class, pred_idx, probs = learn.predict(img)

            # NoDisease가 더 높은 확률이라면 Disease로 변환하고, 확률을 1 - NoDisease로 설정
            if pred_class == "NoDisease":
                pred_class = "Disease"
                pred_idx = 0
                probs[pred_idx] = 1 - probs[1]

            # Store the result for this model
            results[key] = {
                "disease": key,
                "probability": f"{probs[pred_idx]:.4f}",
                "modelMd5Hash": CAT_MODELS_HASHES.get(key)
            }
        
        # 5. Return the results
        submit_eye_results(submission_id=submission_id, auth_token=token, results=results)
        return results
    except Exception as e:
        logging.error(f"Error during prediction: {e}")
        submit_status_update(
            submission_id=submission_id, 
            auth_token=token, 
            status="FAILED", 
            message="진단 중 오류가 발생했습니다. 다시 시도해주세요."
        )
        return {"error": f"Prediction failed: {e}"}

@app.task
def predict_urine_analysis(image_url: str, submission_id: str):
    """
    Celery task to predict urine analysis results from an S3/CloudFront image URL.

    :param image_url: A string URL to the image file (e.g., CloudFront URL).
    :param submission_id: A string ID representing the submission.
    :return: A dictionary containing prediction results.
    """
    # This function is a placeholder for urine analysis prediction logic
    # Implement your urine analysis prediction logic here

    # 1. Login to get auth token (if needed for further processing)
    token = get_auth_token()
    if not token:
        return {"error": "Authentication failed. Could not obtain JWT token."}

    # 2. Call the urine analysis function 
    results = check_urine(image_url)
    if "error" in results:
        submit_status_update(submission_id=submission_id, auth_token=token, status="FAILED", message=results["error"])
        return results

    submit_urine_results(submission_id=submission_id, auth_token=token, results=results["results"])
    return results

# Example of how to call the task and see the result:
# from celery_app import predict_dog_disease
# result = predict_dog_disease.delay('https://your.cloudfront.domain/path/to/image.jpg')
# print(result.get(timeout=10))