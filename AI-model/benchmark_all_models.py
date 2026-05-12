from pathlib import Path
import json
import hashlib
import pandas as pd
import matplotlib.pyplot as plt
import mlflow

from fastai.vision.all import load_learner, PILImage, get_image_files
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report, ConfusionMatrixDisplay


DOG_MODELS = {
    "dog_blepharitis": "dog_models/dog_blepharitis.pkl",
    "dog_cataract": "dog_models/dog_cataract.pkl",
    "dog_conjunctivitis": "dog_models/dog_conjunctivitis.pkl",
    "dog_entropion": "dog_models/dog_entropion.pkl",
    "dog_eyelid_tumor": "dog_models/dog_eyelid_tumor.pkl",
    "dog_incontinence": "dog_models/dog_incontinence.pkl",
    "dog_non_ulcerative_keratitis": "dog_models/dog_non_ulcerative_keratitis.pkl",
    "dog_nuclear_sclerosis": "dog_models/dog_nuclear_sclerosis.pkl",
    "dog_pigmentary_keratitis": "dog_models/dog_pigmentary_keratitis.pkl",
    "dog_ulcerative_keratitis": "dog_models/dog_ulcerative_keratitis.pkl",
}

CAT_MODELS = {
    "cat_blepharitis": "cat_models/cat_blepharitis.pkl",
    "cat_conjunctivitis": "cat_models/cat_conjunctivitis.pkl",
    "cat_corneal_dystrophy": "cat_models/cat_corneal_dystrophy.pkl",
    "cat_corneal_ulcer": "cat_models/cat_corneal_ulcer.pkl",
    "cat_non_ulcerative_keratitis": "cat_models/cat_non_ulcerative_keratitis.pkl",
}

DATA_ROOT = Path("benchmark_data")
OUTPUT_ROOT = Path("benchmark_results")
OUTPUT_ROOT.mkdir(exist_ok=True)

LABELS = ["Disease", "NoDisease"]


def file_md5(path: Path) -> str:
    md5 = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            md5.update(chunk)
    return md5.hexdigest()


def collect_dataset(species: str, model_name: str):
    """
    Expected structure:
    benchmark_data/
      dog/
        dog_blepharitis/
          Disease/
          NoDisease/
      cat/
        cat_conjunctivitis/
          Disease/
          NoDisease/
    """
    dataset_dir = DATA_ROOT / species / model_name

    if not dataset_dir.exists():
        print(f"[SKIP] Dataset not found: {dataset_dir}")
        return []

    samples = []
    for label in LABELS:
        label_dir = dataset_dir / label
        if not label_dir.exists():
            print(f"[WARN] Label folder missing: {label_dir}")
            continue

        for img_path in get_image_files(label_dir):
            samples.append((img_path, label))

    return samples


def benchmark_one_model(species: str, model_name: str, model_path: str):
    model_path = Path(model_path)

    if not model_path.exists():
        print(f"[SKIP] Model not found: {model_path}")
        return None

    samples = collect_dataset(species, model_name)
    if not samples:
        print(f"[SKIP] No benchmark data for {model_name}")
        return None

    print(f"\n[LOAD] {model_name} -> {model_path}")
    learn = load_learner(model_path, cpu=False)

    y_true = []
    y_pred = []
    rows = []

    for img_path, true_label in samples:
        try:
            img = PILImage.create(img_path)
            pred_class, pred_idx, probs = learn.predict(img)

            pred_label = str(pred_class)

            y_true.append(true_label)
            y_pred.append(pred_label)

            rows.append({
                "model": model_name,
                "image_path": str(img_path),
                "true_label": true_label,
                "pred_label": pred_label,
                "probability": float(probs[pred_idx]),
                "is_correct": true_label == pred_label,
            })

        except Exception as e:
            rows.append({
                "model": model_name,
                "image_path": str(img_path),
                "true_label": true_label,
                "pred_label": "ERROR",
                "probability": None,
                "is_correct": False,
                "error": str(e),
            })

    accuracy = accuracy_score(y_true, y_pred)
    f1_macro = f1_score(y_true, y_pred, average="macro", zero_division=0)
    f1_weighted = f1_score(y_true, y_pred, average="weighted", zero_division=0)

    model_out = OUTPUT_ROOT / model_name
    model_out.mkdir(parents=True, exist_ok=True)

    pred_df = pd.DataFrame(rows)
    pred_csv = model_out / "predictions.csv"
    pred_df.to_csv(pred_csv, index=False, encoding="utf-8-sig")

    report = classification_report(
        y_true,
        y_pred,
        labels=LABELS,
        output_dict=True,
        zero_division=0,
    )

    report_path = model_out / "classification_report.json"
    with report_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    cm = confusion_matrix(y_true, y_pred, labels=LABELS)
    cm_csv = model_out / "confusion_matrix.csv"
    pd.DataFrame(cm, index=LABELS, columns=LABELS).to_csv(cm_csv, encoding="utf-8-sig")

    cm_png = model_out / "confusion_matrix.png"
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=LABELS)
    disp.plot(values_format="d")
    plt.title(f"{model_name} Confusion Matrix")
    plt.tight_layout()
    plt.savefig(cm_png)
    plt.close()

    misclassified_csv = None
    if model_name == "cat_conjunctivitis":
        misclassified = pred_df[pred_df["is_correct"] == False]
        misclassified_csv = model_out / "misclassified_cat_conjunctivitis.csv"
        misclassified.to_csv(misclassified_csv, index=False, encoding="utf-8-sig")

    with mlflow.start_run(run_name=model_name):
        mlflow.log_param("species", species)
        mlflow.log_param("model_name", model_name)
        mlflow.log_param("model_path", str(model_path))
        mlflow.log_param("model_md5", file_md5(model_path))
        mlflow.log_param("num_samples", len(samples))

        mlflow.log_metric("accuracy", accuracy)
        mlflow.log_metric("f1_macro", f1_macro)
        mlflow.log_metric("f1_weighted", f1_weighted)

        mlflow.log_artifact(str(pred_csv))
        mlflow.log_artifact(str(report_path))
        mlflow.log_artifact(str(cm_csv))
        mlflow.log_artifact(str(cm_png))

        if misclassified_csv:
            mlflow.log_artifact(str(misclassified_csv))

    result = {
        "species": species,
        "model": model_name,
        "num_samples": len(samples),
        "accuracy": accuracy,
        "f1_macro": f1_macro,
        "f1_weighted": f1_weighted,
        "prediction_csv": str(pred_csv),
        "confusion_matrix_png": str(cm_png),
    }

    print(f"[DONE] {model_name} | Acc={accuracy:.4f} | F1_macro={f1_macro:.4f}")
    return result


def main():
    mlflow.set_experiment("SmartHealthDog_Model_Benchmark")

    results = []

    for model_name, model_path in DOG_MODELS.items():
        result = benchmark_one_model("dog", model_name, model_path)
        if result:
            results.append(result)

    for model_name, model_path in CAT_MODELS.items():
        result = benchmark_one_model("cat", model_name, model_path)
        if result:
            results.append(result)

    summary_df = pd.DataFrame(results)
    summary_path = OUTPUT_ROOT / "benchmark_summary.csv"
    summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")

    print("\n===== Benchmark Summary =====")
    print(summary_df)
    print(f"\nSaved summary: {summary_path}")


if __name__ == "__main__":
    main()
