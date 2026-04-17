import time
import logging
import os
import hashlib
from fastai.vision.all import *
from PIL import Image

# --- Configuration ---
# Set the folder containing your test images
TEST_IMAGE_DIR = "input" 
INFERENCE_INTERVAL_SECONDS = 10 
# Set logging level for visibility
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Model Initialization Setup (from your original code) ---

# Function to calculate MD5 hash of a file (optional, but kept for model tracking)
def calculate_file_md5(file_path: str, chunk_size: int = 4096) -> str | None:
    """Calculates the MD5 hash of a file."""
    if not os.path.isfile(file_path):
        return None
        
    md5_hash = hashlib.md5()
    try:
        with open(file_path, 'rb') as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                md5_hash.update(byte_block)
        return md5_hash.hexdigest()
    except IOError:
        return None

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

# Load all models once 
try:
    ## For GPU acceleration
    # DOG_MODELS = {name: load_learner(path, cpu=False) for path, name in DOG_MODELS_NAMES.items()}
    # DOG_MODELS_HASHES = {name: calculate_file_md5(path) for path, name in DOG_MODELS_NAMES.items()}
    
    # CAT_MODELS = {name: load_learner(path, cpu=False) for path, name in CAT_MODELS_NAMES.items()}
    # CAT_MODELS_HASHES = {name: calculate_file_md5(path) for path, name in CAT_MODELS_NAMES.items()}

    ## For CPU inference (uncomment if no GPU available)
    DOG_MODELS = {name: load_learner(path, cpu=False) for path, name in DOG_MODELS_NAMES.items()}
    DOG_MODELS_HASHES = {name: calculate_file_md5(path) for path, name in DOG_MODELS_NAMES.items()}
    CAT_MODELS = {name: load_learner(path, cpu=False) for path, name in CAT_MODELS_NAMES.items()}
    CAT_MODELS_HASHES = {name: calculate_file_md5(path) for path, name in CAT_MODELS_NAMES.items()}
    
    # Combine all models and hashes into single dictionaries
    ALL_MODELS = {**DOG_MODELS, **CAT_MODELS}
    ALL_MODELS_HASHES = {**DOG_MODELS_HASHES, **CAT_MODELS_HASHES}

    logging.info(f"Loaded {len(ALL_MODELS)} models successfully.")
    logging.info(f"All loaded models: {list(ALL_MODELS.keys())}")
except Exception as e:
    logging.error(f"Failed to load models. Check paths and fastai environment. Error: {e}")
    exit(1)

## For GPU acceleration (uncomment if GPU is available)
# device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# # Set device attribute on each learner's DataLoaders to avoid AttributeError during predict
# for learn in ALL_MODELS.values():
#     learn.dls.device = device
#     learn.to(device)

# --- Inference Function ---

def make_universal_prediction(img_path: Path):
    """
    Performs inference on a single image using ALL loaded models.
    """
    logging.info(f"Starting universal inference for: {img_path.name}")
    results = {}
    
    try:
        # Load the image using fastai's method
        img = PILImage.create(img_path)
    except Exception as e:
        logging.error(f"Failed to load image {img_path.name}: {e}")
        return {"error": f"Image load failed for {img_path.name}"}

    # Iterate over ALL combined models
    for key, learn in ALL_MODELS.items():
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
    
    return results

# --- Main Loop ---

if __name__ == "__main__":
    
    # 1. Get a list of all image files in the test directory
    all_image_paths = get_image_files(TEST_IMAGE_DIR)
    
    if not all_image_paths:
        logging.error(f"No image files found in '{TEST_IMAGE_DIR}'. Please add some images.")
        exit(1)

    logging.info(f"Found {len(all_image_paths)} images to process universally.")
    
    while True:
        start_time = time.time()
        
        logging.info("-" * 40)
        logging.info("STARTING NEW UNIVERSAL INFERENCE CYCLE")
        
        for img_path in all_image_paths:
            # Perform prediction against ALL models
            prediction_results = make_universal_prediction(img_path)
            
            # Log a summary
            if "error" in prediction_results:
                logging.error(f"Inference error for {img_path.name}: {prediction_results['error']}")
            else:
                logging.info(f"Inference complete for {img_path.name}. Total {len(prediction_results)} predictions made.")

        end_time = time.time()
        
        # Calculate time taken and delay for the required interval
        cycle_duration = end_time - start_time
        
        logging.info(f"Inference cycle took {cycle_duration:.2f} seconds.")

        ## Log that we are sleeping for 5 seconds
        logging.info("Sleeping for 5 seconds before next cycle...") 
        time.sleep(5)
