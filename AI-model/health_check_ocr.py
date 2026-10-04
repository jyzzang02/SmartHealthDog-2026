import cv2
import json
import sys
import numpy as np

from pathlib import Path
from paddleocr import PaddleOCR

from health_check_parser import HealthCheckParser


class HealthCheckOCR:
    """
    동물병원 진단서 범용 OCR - PaddleOCR 버전


    HealthCheckParser가 요구하는 출력 형식:
    {
        "raw_text": "...",
        "blocks": [
            {
                "text": "...",
                "confidence": 0.99,
                "bbox": [...],
                "x1": ...,
                "y1": ...,
                "x2": ...,
                "y2": ...,
                "center_x": ...,
                "center_y": ...
            }
        ]
    }
    """

    def __init__(self, gpu=False):

        print("PaddleOCR 모델 로딩 중...")

        device = "gpu" if gpu else "cpu"

        self.reader = PaddleOCR(
            lang="korean",
            device=device,

            # 진단서 사진 대응
            use_doc_orientation_classify=True,
            use_doc_unwarping=True,
            use_textline_orientation=True
        )

        print("PaddleOCR 모델 로딩 완료")

    # =========================================================
    # 이미지 로딩 / 기본 전처리
    # =========================================================

    def preprocess_image(self, image_path):

        image = cv2.imread(
            str(image_path)
        )

        if image is None:

            raise ValueError(
                "이미지를 읽을 수 없습니다: "
                f"{image_path}"
            )

        height, width = image.shape[:2]

        # 작은 문서만 확대
        # 지나친 전처리는 오히려 작은 글씨를
        # 손상시킬 수 있다.
        if width < 1200:

            scale = 1200 / width

            image = cv2.resize(
                image,
                None,
                fx=scale,
                fy=scale,
                interpolation=cv2.INTER_CUBIC
            )

        return image

    # =========================================================
    # Polygon → bbox 변환
    # =========================================================

    @staticmethod
    def polygon_to_block(
        polygon,
        text,
        confidence
    ):

        points = np.asarray(
            polygon
        ).reshape(-1, 2)

        converted_bbox = [
            [
                int(point[0]),
                int(point[1])
            ]
            for point in points
        ]

        xs = [
            point[0]
            for point in converted_bbox
        ]

        ys = [
            point[1]
            for point in converted_bbox
        ]

        x1 = min(xs)
        y1 = min(ys)

        x2 = max(xs)
        y2 = max(ys)

        return {
            "text": " ".join(
                str(text).split()
            ),

            "confidence": round(
                float(confidence),
                4
            ),

            "bbox": converted_bbox,

            "x1": x1,
            "y1": y1,

            "x2": x2,
            "y2": y2,

            "center_x": int(
                (x1 + x2) / 2
            ),

            "center_y": int(
                (y1 + y2) / 2
            )
        }

    # =========================================================
    # PaddleOCR Result → 기존 Parser 형식
    # =========================================================

    def convert_result(self, prediction):

        blocks = []

        for page_result in prediction:

            # PaddleOCR Result 객체에서
            # JSON 형태의 결과를 가져온다.
            try:
                data = page_result.json
            except Exception:
                data = None

            if callable(data):
                data = data()

            if data is None:
                continue

            # 버전에 따라 {"res": {...}} 형태일 수 있음
            if isinstance(data, dict):

                if "res" in data:
                    data = data["res"]

            if not isinstance(
                data,
                dict
            ):
                continue

            texts = (
                data.get(
                    "rec_texts",
                    []
                )
            )

            scores = (
                data.get(
                    "rec_scores",
                    []
                )
            )

            polygons = (
                data.get(
                    "rec_polys",
                    []
                )
            )

            # 일부 버전/파이프라인에서는
            # dt_polys 키로 위치가 제공될 수 있음
            if len(polygons) == 0:

                polygons = (
                    data.get(
                        "dt_polys",
                        []
                    )
                )

            count = min(
                len(texts),
                len(scores),
                len(polygons)
            )

            for index in range(
                count
            ):

                text = str(
                    texts[index]
                ).strip()

                if not text:
                    continue

                block = (
                    self.polygon_to_block(
                        polygons[index],
                        text,
                        scores[index]
                    )
                )

                blocks.append(
                    block
                )

        # 기존 parser와 동일하게
        # 위 → 아래 / 왼쪽 → 오른쪽 정렬
        blocks.sort(
            key=lambda block: (
                block["center_y"],
                block["center_x"]
            )
        )

        raw_text = "\n".join(
            block["text"]
            for block in blocks
        )

        return {
            "raw_text": raw_text,
            "blocks": blocks
        }

    # =========================================================
    # OCR 실행
    # =========================================================

    def extract_text(
        self,
        image_path
    ):

        image_path = Path(
            image_path
        )

        if not image_path.exists():

            raise FileNotFoundError(
                "이미지를 찾을 수 없습니다: "
                f"{image_path}"
            )

        image = (
            self.preprocess_image(
                image_path
            )
        )

        print("PaddleOCR 텍스트 인식 중...")

        prediction = (
            self.reader.predict(
                image
            )
        )

        result = (
            self.convert_result(
                prediction
            )
        )

        print(
            f'OCR 블록 수: '
            f'{len(result["blocks"])}'
        )

        return result


# =============================================================
# OCR 원문 출력
# =============================================================

def print_ocr_result(
    result
):

    print(
        "\n========== OCR 전체 텍스트 ==========\n"
    )

    print(
        result["raw_text"]
    )


# =============================================================
# 구조화된 필드 출력
# =============================================================

def print_fields(
    fields
):

    print(
        "\n========== 추출된 건강정보 ==========\n"
    )

    print(
        json.dumps(
            fields,
            ensure_ascii=False,
            indent=2
        )
    )


# =============================================================
# JSON 저장
# =============================================================

def save_json(
    result,
    image_path
):

    image_path = Path(
        image_path
    )

    output_path = (
        image_path.parent
        /
        (
            f"{image_path.stem}"
            "_ocr.json"
        )
    )

    with open(
        output_path,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            result,
            file,
            ensure_ascii=False,
            indent=2
        )

    return output_path


# =============================================================
# Backend / AI Worker에서 호출
# =============================================================

def analyze_health_document(
    image_path,
    gpu=False
):

    # -----------------------------------------
    # 1. PaddleOCR
    # -----------------------------------------

    ocr = HealthCheckOCR(
        gpu=gpu
    )

    ocr_result = (
        ocr.extract_text(
            image_path
        )
    )

    # -----------------------------------------
    # 2. 기존 Parser
    # -----------------------------------------

    parser = (
        HealthCheckParser()
    )

    fields = (
        parser.parse(
            ocr_result
        )
    )

    # -----------------------------------------
    # 3. Backend 전달용 결과
    # -----------------------------------------

    return {
        "fields": fields,

        "raw_text": (
            ocr_result[
                "raw_text"
            ]
        ),

        "blocks": (
            ocr_result[
                "blocks"
            ]
        )
    }


# =============================================================
# 터미널 실행
# =============================================================

def main():

    if len(sys.argv) < 2:

        print(
            "사용법: "
            "python health_check_ocr.py "
            "<진단서 이미지>"
        )

        sys.exit(1)

    image_path = (
        sys.argv[1]
    )

    try:

        result = (
            analyze_health_document(
                image_path,
                gpu=False
            )
        )

        print_ocr_result(
            result
        )

        print_fields(
            result[
                "fields"
            ]
        )

        output_path = (
            save_json(
                result,
                image_path
            )
        )

        print(
            "\nOCR 처리 완료"
        )

        print(
            "JSON 저장 위치: "
            f"{output_path}"
        )

    except Exception as error:

        print(
            "\nOCR 처리 중 오류 발생:"
        )

        print(
            repr(error)
        )

        sys.exit(1)


if __name__ == "__main__":
    main()