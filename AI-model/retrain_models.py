"""
개/고양이 안구 질환 모델 통합 재학습

종별 최적 설정:
- 개(DOG): EfficientNet B4 / CrossEntropyLoss / 단일 모델 / 에포크 20
- 고양이(CAT): EfficientNet B4 / FocalLoss / TTA / KFold 앙상블(데이터 부족 질환) / 에포크 40+
"""

import json
import logging
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Tuple
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import f1_score, classification_report

import torch
import torch.nn as nn
import torch.nn.functional as F

if not torch.cuda.is_available():
    raise RuntimeError("GPU를 찾을 수 없습니다.")

from fastai.vision.all import *
from torchvision.models import efficientnet_b4

defaults.device = torch.device('cuda')

# ============================================================================
# 플래그
# ============================================================================

RUN_DOG    = True   # 개 모델 학습 여부
RUN_CAT    = False   # 고양이 모델 학습 여부
USE_KFOLD  = False   # 고양이 데이터 부족 질환에 K-Fold 앙상블 적용

# ============================================================================
# 공통 설정
# ============================================================================

DATASET_ROOT = Path("./training_data")
OUTPUT_DIR   = Path("./retrain_results")
BACKUP_DIR   = Path("./models_backup")
IMG_SIZE     = 224

# ============================================================================
# 개 설정
# ============================================================================

DOG_MODELS_DIR  = Path("./dog_models")
DOG_BATCH_SIZE  = 32
DOG_NUM_EPOCHS  = 20
DOG_WEIGHT_DECAY = 0.01

DOG_DISEASES = {
    "결막염":        "Conjunctivitis",
    "백내장":        "Cataract",
    "안검염":        "Blepharitis",
    "안검내반":      "Entropion",
    "안검종양":      "Eyelid_Tumor",
    "유루증":        "Epiphora",
    "비궤양성각막염": "Non_ulcerative_Keratitis",
    "핵경화증":      "Nuclear_Sclerosis",
    "색소각막염":    "Pigmentary_Keratitis",
    "궤양성각막염":  "Ulcerative_Keratitis",
}

# ============================================================================
# 고양이 설정
# ============================================================================

CAT_MODELS_DIR   = Path("./cat_models")
CAT_WEIGHT_DECAY = 0.05

# 개→고양이 백본 이전 대상
DOG_CAT_COMMON   = {"Blepharitis", "Conjunctivitis"}
KFOLD_DISEASES   = {"Blepharitis", "Non_ulcerative_Keratitis"}
N_SPLITS         = 5

CAT_DISEASES = {
    "결막염":        "Conjunctivitis",
    "안검염":        "Blepharitis",
    "각막이영양증":   "Corneal_Scapula",
    "각막궤양":      "Corneal_Ulcer",
    "비궤양성각막염": "Non_ulcerative_Keratitis",
}

CAT_DISEASE_CONFIG = {
    "Blepharitis": {
        "batch_size":    12,
        "phase1_epochs": 5,
        "phase2_epochs": 50,
        "lr_range":      slice(1e-5, 5e-5),
        "patience":      10,
        "focal_gamma":   2.0,
    },
    "Conjunctivitis": {
        "batch_size":    16,
        "phase1_epochs": 3,
        "phase2_epochs": 37,
        "lr_range":      slice(1e-6, 3e-5),
        "patience":      7,
        "focal_gamma":   2.0,
    },
    "Corneal_Scapula": {
        "batch_size":    16,
        "phase1_epochs": 3,
        "phase2_epochs": 37,
        "lr_range":      slice(1e-5, 1e-4),
        "patience":      7,
        "focal_gamma":   1.5,
    },
    "Corneal_Ulcer": {
        "batch_size":    16,
        "phase1_epochs": 3,
        "phase2_epochs": 37,
        "lr_range":      slice(8e-6, 8e-5),
        "patience":      7,
        "focal_gamma":   2.0,
    },
    "Non_ulcerative_Keratitis": {
        "batch_size":    12,
        "phase1_epochs": 3,
        "phase2_epochs": 37,
        "lr_range":      slice(1e-5, 1e-4),
        "patience":      7,
        "focal_gamma":   2.0,
    },
}

# ============================================================================
# 로깅
# ============================================================================

OUTPUT_DIR.mkdir(exist_ok=True)
log_file = OUTPUT_DIR / f"retrain_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ============================================================================
# Focal Loss (고양이 전용)
# ============================================================================

class FocalLoss(nn.Module):
    def __init__(self, gamma: float = 2.0):
        super().__init__()
        self.gamma = gamma

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        target = target.long()
        ce     = F.cross_entropy(pred, target, reduction='none')
        pt     = torch.exp(-ce)
        return (((1 - pt) ** self.gamma) * ce).mean()

    def decodes(self, x: torch.Tensor) -> torch.Tensor:
        return x.argmax(dim=-1)

    def activation(self, x: torch.Tensor) -> torch.Tensor:
        return F.softmax(x, dim=-1)

# ============================================================================
# 공통 유틸
# ============================================================================

def parse_dataset(species: str) -> dict:
    diseases = DOG_DISEASES if species == "dog" else CAT_DISEASES
    dataset_info = {}

    for disease_ko, disease_en in diseases.items():
        disease_path = DATASET_ROOT / species / f"{species}_{disease_en.lower()}"

        if not disease_path.exists():
            logger.warning(f"폴더 없음: {disease_path}")
            continue

        images_list = []
        for severity in ["NoDisease", "Disease"]:
            severity_path = disease_path / severity
            if severity_path.exists():
                for img_file in sorted(severity_path.glob("*.jpg")):
                    images_list.append({
                        "image":   str(img_file),
                        "label":   severity,
                        "disease": disease_en,
                        "species": species,
                    })

        if images_list:
            d = sum(1 for i in images_list if i["label"] == "Disease")
            dataset_info[disease_en] = images_list
            logger.info(f"[{species.upper()}] {disease_en}: {len(images_list)}개 (Disease:{d} NoDisease:{len(images_list)-d})")
        else:
            logger.warning(f"[{species.upper()}] {disease_en}: 이미지 없음")

    return dataset_info


def create_split(dataset_info: dict, test_size=0.15, val_size=0.15) -> dict:
    split_data = {}
    for disease, images in dataset_info.items():
        train, temp = train_test_split(
            images, test_size=(test_size + val_size),
            random_state=42, stratify=[i["label"] for i in images]
        )
        val, test = train_test_split(
            temp, test_size=test_size / (test_size + val_size),
            random_state=42, stratify=[i["label"] for i in temp]
        )
        split_data[disease] = {"train": train, "val": val, "test": test}
        logger.info(f"  {disease} - Train:{len(train)} Val:{len(val)} Test:{len(test)}")
    return split_data


def get_test_labels(disease_images: dict, disease_idx: int) -> list:
    return [
        disease_idx if img["label"] == "Disease" else 1 - disease_idx
        for img in disease_images["test"]
    ]

# ============================================================================
# 개 전용 DataLoaders
# ============================================================================

def make_dog_dls(disease_images: dict) -> Tuple[DataLoaders, dict]:
    aug = aug_transforms(
        size=IMG_SIZE,
        min_scale=0.8,
        max_rotate=20,
        max_lighting=0.3,
        p_lighting=0.7
    )
    rows = []
    for split_type in ["train", "val", "test"]:
        for img in disease_images[split_type]:
            rows.append({"image": img["image"], "label": img["label"]})
    df = pd.DataFrame(rows)

    n_train = len(disease_images["train"])
    n_val   = len(disease_images["val"])

    def splitter(df):
        return list(range(n_train)), list(range(n_train, n_train + n_val))

    dls = ImageDataLoaders.from_df(
        df, path=".",
        fn_col="image", label_col="label",
        item_tfms=[Resize(IMG_SIZE)],
        batch_tfms=aug,
        splitter=splitter,
        bs=DOG_BATCH_SIZE,
        num_workers=0,
    )
    return dls, {
        "train_size": n_train,
        "val_size":   n_val,
        "test_size":  len(disease_images["test"]),
        "vocab":      list(dls.vocab),
    }

# ============================================================================
# 고양이 전용 DataLoaders
# ============================================================================

def make_cat_dls(train_images: list, val_images: list, batch_size: int) -> DataLoaders:
    aug = aug_transforms(
        size=IMG_SIZE,
        min_scale=0.7,
        max_rotate=30,
        max_lighting=0.4,
        p_lighting=0.75,
        max_warp=0.25,
        max_zoom=1.3,
        p_affine=0.85,
    )
    rows = (
        [{"image": i["image"], "label": i["label"]} for i in train_images] +
        [{"image": i["image"], "label": i["label"]} for i in val_images]
    )
    df      = pd.DataFrame(rows)
    n_train = len(train_images)
    n_val   = len(val_images)

    def splitter(df):
        return list(range(n_train)), list(range(n_train, n_train + n_val))

    return ImageDataLoaders.from_df(
        df, path=".",
        fn_col="image", label_col="label",
        item_tfms=[Resize(IMG_SIZE)],
        batch_tfms=aug,
        splitter=splitter,
        bs=batch_size,
        num_workers=0,
    )

# ============================================================================
# 개 백본 이전 (고양이용)
# ============================================================================

def transfer_dog_backbone(learn: Learner, disease: str) -> bool:
    if disease not in DOG_CAT_COMMON:
        return False

    dog_model_path = DOG_MODELS_DIR / f"dog_{disease.lower().replace(' ', '_')}.pkl"
    if not dog_model_path.exists():
        logger.warning(f"개 모델 없음 (건너뜀): {dog_model_path}")
        return False

    try:
        dog_learn = load_learner(str(dog_model_path))
        learn.model[0].load_state_dict(dog_learn.model[0].state_dict())
        del dog_learn
        torch.cuda.empty_cache()
        logger.info(f"개 백본 이전 완료: {dog_model_path}")
        return True
    except Exception as e:
        logger.warning(f"백본 이전 실패 ({e}), 일반 학습 진행")
        return False

# ============================================================================
# 개 모델 학습
# ============================================================================

def train_dog_model(disease: str, disease_images: dict, output_dir: Path) -> dict:
    logger.info(f"\n{'='*60}")
    logger.info(f"[DOG] {disease}")
    logger.info(f"{'='*60}")

    try:
        dls, stats = make_dog_dls(disease_images)
        logger.info(f"Train:{stats['train_size']} Val:{stats['val_size']} Test:{stats['test_size']} Vocab:{stats['vocab']}")

        disease_idx = dls.vocab.o2i.get("Disease", 1)
        test_labels = get_test_labels(disease_images, disease_idx)

        learn = vision_learner(
            dls, efficientnet_b4,
            metrics=accuracy,
            loss_func=CrossEntropyLossFlat()
        )
        learn.model_dir = str(output_dir)

        # Phase 1
        logger.info("Phase 1: 헤드 학습 (1 epoch, lr=3e-3)")
        learn.fit_one_cycle(1, 3e-3, wd=DOG_WEIGHT_DECAY)

        # Phase 2
        learn.unfreeze()
        cb_early = EarlyStoppingCallback(monitor='valid_loss', patience=5)
        cb_save  = SaveModelCallback(monitor='valid_loss', fname=f"{disease}_best")
        learn.add_cbs([cb_early, cb_save])

        logger.info(f"Phase 2: 전체 학습 (최대 {DOG_NUM_EPOCHS - 1} epochs, lr=1e-5~1e-4)")
        try:
            learn.fit_one_cycle(DOG_NUM_EPOCHS - 1, slice(1e-5, 1e-4), wd=DOG_WEIGHT_DECAY)
        finally:
            learn.remove_cbs([cb_early, cb_save])

        learn.load(f"{disease}_best")

        # 테스트 평가
        test_dl      = dls.test_dl([img["image"] for img in disease_images["test"]])
        preds, _     = learn.get_preds(dl=test_dl)
        pred_classes = preds.argmax(dim=1).numpy()
        test_acc     = (pred_classes == np.array(test_labels)).mean()
        f1           = f1_score(test_labels, pred_classes, average='macro')
        logger.info(f"테스트 정확도: {test_acc:.4f} | F1: {f1:.4f}")

        # 저장
        DOG_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        safe_name  = disease.lower().replace(' ', '_')
        model_path = DOG_MODELS_DIR / f"dog_{safe_name}.pkl"
        learn.export(str(model_path))
        logger.info(f"저장: {model_path}")

        return {
            "disease":    disease, "species": "dog", "status": "success",
            "model_path": str(model_path),
            "test_acc":   float(test_acc), "f1_macro": float(f1),
            "train_size": stats['train_size'], "val_size": stats['val_size'], "test_size": stats['test_size'],
        }

    except Exception as e:
        logger.error(f"[실패] {disease}: {str(e)}", exc_info=True)
        return {"disease": disease, "species": "dog", "status": "failed", "error": str(e)}

# ============================================================================
# 고양이 단일 모델 학습
# ============================================================================

def train_cat_single(
    disease:      str,
    train_images: list,
    val_images:   list,
    output_dir:   Path,
    model_fname:  str,
    config:       dict,
    do_transfer:  bool = True,
) -> Learner:
    dls = make_cat_dls(train_images, val_images, config["batch_size"])

    learn = vision_learner(
        dls, efficientnet_b4,
        metrics=accuracy,
        loss_func=FocalLoss(gamma=config["focal_gamma"])
    )
    learn.model_dir = str(output_dir)

    transferred = transfer_dog_backbone(learn, disease) if do_transfer else False
    phase1_lr   = 1e-3 if transferred else 3e-3
    lr_range    = slice(1e-6, 3e-5) if transferred else config["lr_range"]

    logger.info(f"  Phase 1: {config['phase1_epochs']} epochs | lr={phase1_lr} | 백본이전={transferred}")
    learn.fit_one_cycle(config["phase1_epochs"], phase1_lr, wd=CAT_WEIGHT_DECAY)

    learn.unfreeze()
    cb_early = EarlyStoppingCallback(monitor='valid_loss', patience=config["patience"])
    cb_save  = SaveModelCallback(monitor='valid_loss', fname=model_fname)
    learn.add_cbs([cb_early, cb_save])

    logger.info(f"  Phase 2: 최대 {config['phase2_epochs']} epochs | lr={lr_range}")
    try:
        learn.fit_one_cycle(config["phase2_epochs"], lr_range, wd=CAT_WEIGHT_DECAY)
    finally:
        learn.remove_cbs([cb_early, cb_save])

    learn.load(model_fname)
    return learn

# ============================================================================
# 앙상블 TTA 추론
# ============================================================================

def ensemble_tta_predict(
    learners:    List[Learner],
    test_images: list,
    ref_dls:     DataLoaders,
    n_tta:       int = 8,
    beta:        float = 0.25,
) -> np.ndarray:
    test_dl   = ref_dls.test_dl([img["image"] for img in test_images])
    all_preds = []
    for i, learn in enumerate(learners):
        preds, _ = learn.tta(dl=test_dl, n=n_tta, beta=beta)
        all_preds.append(preds.numpy())
        logger.info(f"  TTA 완료: {i+1}/{len(learners)}")
    return np.stack(all_preds).mean(axis=0)

# ============================================================================
# 고양이 모델 학습 (KFold 분기 포함)
# ============================================================================

def train_cat_model(disease: str, disease_images: dict, output_dir: Path) -> dict:
    use_kfold = USE_KFOLD and (disease in KFOLD_DISEASES)

    logger.info(f"\n{'='*60}")
    logger.info(f"[CAT] {disease} | KFold={use_kfold}")
    logger.info(f"{'='*60}")

    config      = CAT_DISEASE_CONFIG[disease]
    test_images = disease_images["test"]

    try:
        ref_dls     = make_cat_dls(disease_images["train"], disease_images["val"], config["batch_size"])
        disease_idx = ref_dls.vocab.o2i.get("Disease", 1)
        test_labels = get_test_labels(disease_images, disease_idx)
        logger.info(f"Vocab: {list(ref_dls.vocab)} | Disease idx: {disease_idx}")

        learners = []

        if use_kfold:
            all_tv      = disease_images["train"] + disease_images["val"]
            fold_labels = [img["label"] for img in all_tv]
            skf         = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=42)

            for fold, (tr_idx, vl_idx) in enumerate(skf.split(all_tv, fold_labels)):
                logger.info(f"\n--- Fold {fold+1}/{N_SPLITS} ---")
                learn = train_cat_single(
                    disease      = disease,
                    train_images = [all_tv[i] for i in tr_idx],
                    val_images   = [all_tv[i] for i in vl_idx],
                    output_dir   = output_dir,
                    model_fname  = f"cat_{disease}_fold{fold+1}",
                    config       = config,
                    do_transfer  = (disease in DOG_CAT_COMMON),
                )
                learners.append(learn)
        else:
            learn = train_cat_single(
                disease      = disease,
                train_images = disease_images["train"],
                val_images   = disease_images["val"],
                output_dir   = output_dir,
                model_fname  = f"cat_{disease}_best",
                config       = config,
                do_transfer  = (disease in DOG_CAT_COMMON),
            )
            learners.append(learn)

        # TTA 앙상블 평가
        logger.info(f"\n테스트 평가 (TTA n=8, {len(learners)}개 모델)...")
        avg_preds    = ensemble_tta_predict(learners, test_images, ref_dls)
        pred_classes = avg_preds.argmax(axis=1)

        test_acc = (pred_classes == np.array(test_labels)).mean()
        f1       = f1_score(test_labels, pred_classes, average='macro')
        logger.info(f"테스트 정확도: {test_acc:.4f} | F1: {f1:.4f}")
        logger.info(f"\n{classification_report(test_labels, pred_classes, target_names=['NoDisease','Disease'])}")

        # 저장
        CAT_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        safe_name   = disease.lower().replace(' ', '_')
        saved_paths = []
        for idx, learn in enumerate(learners):
            suffix = f"_fold{idx+1}" if use_kfold else ""
            path   = CAT_MODELS_DIR / f"cat_{safe_name}{suffix}.pkl"
            learn.export(str(path))
            saved_paths.append(str(path))
        logger.info(f"저장: {saved_paths}")

        return {
            "disease":     disease, "species": "cat", "status": "success",
            "model_paths": saved_paths,
            "kfold":       use_kfold, "n_models": len(learners),
            "test_acc":    float(test_acc), "f1_macro": float(f1),
            "transferred": disease in DOG_CAT_COMMON,
            "train_size":  len(disease_images["train"]),
            "val_size":    len(disease_images["val"]),
            "test_size":   len(test_images),
        }

    except Exception as e:
        logger.error(f"[실패] {disease}: {str(e)}", exc_info=True)
        return {"disease": disease, "species": "cat", "status": "failed", "error": str(e)}

# ============================================================================
# 메인
# ============================================================================

def main():
    logger.info("통합 재학습 시작")
    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    logger.info(f"RUN_DOG={RUN_DOG} | RUN_CAT={RUN_CAT} | USE_KFOLD={USE_KFOLD}")

    # 기존 모델 백업
    BACKUP_DIR.mkdir(exist_ok=True)
    for models_dir in [DOG_MODELS_DIR, CAT_MODELS_DIR]:
        if models_dir.exists():
            dest = BACKUP_DIR / models_dir.name
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(models_dir, dest)
            logger.info(f"백업: {dest}")

    all_results = []

    # 개 모델
    if RUN_DOG:
        logger.info(f"\n{'='*60}\n[단계 1/2] 개(DOG) 모델 재학습\n{'='*60}")
        dog_dataset = parse_dataset(species="dog")
        if dog_dataset:
            dog_split = create_split(dog_dataset)
            for disease in sorted(dog_split.keys()):
                result = train_dog_model(disease, dog_split[disease], OUTPUT_DIR)
                all_results.append(result)
                torch.cuda.empty_cache()
        else:
            logger.warning("개 데이터셋 없음")

    # 고양이 모델
    if RUN_CAT:
        logger.info(f"\n{'='*60}\n[단계 2/2] 고양이(CAT) 모델 재학습\n{'='*60}")
        cat_dataset = parse_dataset(species="cat")
        if cat_dataset:
            cat_split = create_split(cat_dataset)
            for disease in sorted(cat_split.keys()):
                result = train_cat_model(disease, cat_split[disease], OUTPUT_DIR)
                all_results.append(result)
                torch.cuda.empty_cache()
        else:
            logger.warning("고양이 데이터셋 없음")

    # 요약
    logger.info(f"\n{'='*60}\n완료 요약\n{'='*60}")
    success = [r for r in all_results if r['status'] == 'success']
    failed  = [r for r in all_results if r['status'] == 'failed']
    logger.info(f"성공: {len(success)} / 전체: {len(all_results)}")

    for r in success:
        tags = []
        if r.get('transferred'): tags.append("개백본↑")
        if r.get('kfold'):       tags.append(f"{r.get('n_models')}Fold")
        if r['species'] == 'cat': tags.append("TTA")
        tag_str = f" [{' | '.join(tags)}]" if tags else ""
        acc = r.get('test_acc', 0)
        f1  = r.get('f1_macro', 0)
        logger.info(f"✓ [{r['species'].upper()}] {r['disease']}{tag_str} 정확도:{acc:.4f} F1:{f1:.4f}")
    for r in failed:
        logger.info(f"✗ [{r['species'].upper()}] {r['disease']} | {r['error']}")

    results_file = OUTPUT_DIR / f"results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    logger.info(f"결과 저장: {results_file}")


if __name__ == "__main__":
    main()