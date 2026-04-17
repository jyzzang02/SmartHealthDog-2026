# celeryconfig.py
import os

from dotenv import load_dotenv
load_dotenv()

# --- Backend Authentication Credentials ---
# Load credentials from environment variables.
# The second argument to .get() is an optional default value, 
# but it's better to raise an error if critical credentials are missing.

BACKEND_USERNAME = os.environ.get("AI_MODEL_SERVICE_EMAIL")
BACKEND_PASSWORD = os.environ.get("AI_MODEL_SERVICE_PASSWORD")
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = os.environ.get("REDIS_PORT", "6379")
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD", "")
BACKEND_API_EYE_UPDATE_ENDPOINT = os.environ.get("AI_MODEL_SERVICE_EYE_UPDATE_ENDPOINT")
BACKEND_API_URINE_UPDATE_ENDPOINT = os.environ.get("AI_MODEL_SERVICE_URINE_UPDATE_ENDPOINT")
BACKEND_API_STATUS_UPDATE_ENDPOINT = os.environ.get("AI_MODEL_SERVICE_STATUS_UPDATE_ENDPOINT")
BACKEND_API_LOGIN_ENDPOINT = os.environ.get("AI_MODEL_SERVICE_LOGIN_ENDPOINT")

# Optional: Add validation to ensure they are set
if not BACKEND_USERNAME or not BACKEND_PASSWORD:
    raise EnvironmentError("Critical backend credentials (BACKEND_USERNAME, BACKEND_PASSWORD) are missing.")

# Optional: Add validation for the new API endpoint
if not BACKEND_API_EYE_UPDATE_ENDPOINT:
    raise EnvironmentError("Critical backend API endpoint (BACKEND_API_EYE_UPDATE_ENDPOINT) is missing.")
if not BACKEND_API_URINE_UPDATE_ENDPOINT:
    raise EnvironmentError("Critical backend API endpoint (BACKEND_API_URINE_UPDATE_ENDPOINT) is missing.")
if not BACKEND_API_STATUS_UPDATE_ENDPOINT:
    raise EnvironmentError("Critical backend API endpoint (BACKEND_API_STATUS_UPDATE_ENDPOINT) is missing.")
if not BACKEND_API_LOGIN_ENDPOINT:
    raise EnvironmentError("Critical backend API endpoint (BACKEND_API_LOGIN_ENDPOINT) is missing.")

# Redis URLs
# Broker is for message passing
broker_url = f'redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0'
# Backend is for storing task results
result_backend = f'redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0'

# A list of modules to import when the Celery worker starts
imports = ('smart_health_dog_disease_detection',)

# Task serialization (optional, but a good practice)
task_serializer = 'json'
result_serializer = 'json'
accept_content = ['json']
timezone = 'Asia/Seoul' # Or your desired timezone
enable_utc = True
