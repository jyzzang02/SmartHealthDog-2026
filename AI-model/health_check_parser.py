import re
from difflib import SequenceMatcher

from health_check_fields import (
    FIELD_ALIASES,
    MULTILINE_FIELDS,
    DATE_FIELDS
)


class HealthCheckParser:

    def __init__(self):
        self.aliases = FIELD_ALIASES

        # 병명 자체가 아니라 병명의 상태/구분을 나타내는 표현
        # 특정 질병명과는 무관함
        self.disease_meta_labels = [
            "임상적 추정",
            "임상적추정",
            "최종 진단",
            "최종진단"
        ]

    # =========================================================
    # 기본 텍스트 처리
    # =========================================================

    @staticmethod
    def normalize(text):

        if not text:
            return ""

        text = text.lower().strip()

        text = re.sub(
            r"[\s:：|·ㆍ_\-\[\]{}<>]",
            "",
            text
        )

        return text

    @staticmethod
    def clean_value(value):

        if value is None:
            return None

        value = re.sub(
            r"\s+",
            " ",
            value
        ).strip()

        value = value.strip(
            "|:："
        ).strip()

        if not value:
            return None

        return value

    # =========================================================
    # Alias 목록
    # =========================================================

    def alias_candidates(self):

        candidates = []

        for field, aliases in self.aliases.items():

            for alias in aliases:

                candidates.append(
                    (
                        field,
                        alias,
                        self.normalize(alias)
                    )
                )

        # 긴 라벨부터 검사
        candidates.sort(
            key=lambda x: len(x[2]),
            reverse=True
        )

        return candidates

    # =========================================================
    # 라벨 탐지
    # =========================================================

    def detect_label(self, text):

        normalized_text = self.normalize(
            text
        )

        if not normalized_text:
            return None, None

        # -----------------------------------------------------
        # 1. 정확 일치 또는 "라벨 + 값"
        # -----------------------------------------------------

        for (
            field,
            alias,
            normalized_alias
        ) in self.alias_candidates():

            if normalized_text == normalized_alias:
                return field, alias

            if (
                len(normalized_alias) >= 2
                and
                normalized_text.startswith(
                    normalized_alias
                )
            ):
                return field, alias

        # -----------------------------------------------------
        # 2. OCR이 긴 라벨을 조금 틀린 경우
        # -----------------------------------------------------

        best_match = None
        best_score = 0

        for (
            field,
            alias,
            normalized_alias
        ) in self.alias_candidates():

            # 짧은 단어 fuzzy matching 금지
            if len(normalized_alias) < 4:
                continue

            # 너무 긴 문장을 라벨로 오인하지 않도록 제한
            if (
                len(normalized_text)
                > len(normalized_alias) + 3
            ):
                continue

            score = SequenceMatcher(
                None,
                normalized_text,
                normalized_alias
            ).ratio()

            if score > best_score:

                best_score = score

                best_match = (
                    field,
                    alias
                )

        if (
            best_match is not None
            and best_score >= 0.82
        ):
            return best_match

        return None, None

    # =========================================================
    # OCR 블록 크기
    # =========================================================

    @staticmethod
    def width(block):

        return max(
            block["x2"]
            - block["x1"],
            1
        )

    @staticmethod
    def height(block):

        return max(
            block["y2"]
            - block["y1"],
            1
        )

    # =========================================================
    # 같은 행인지 판단
    # =========================================================

    def same_row(
        self,
        a,
        b
    ):

        tolerance = max(
            max(
                self.height(a),
                self.height(b)
            ) * 0.65,
            12
        )

        return (
            abs(
                a["center_y"]
                - b["center_y"]
            )
            <= tolerance
        )

    # =========================================================
    # Inline 값 추출
    # =========================================================

    def extract_inline_value(
        self,
        text,
        alias
    ):

        # alias 내부의 공백 차이 허용
        compact_alias = re.sub(
            r"\s+",
            r"\\s*",
            re.escape(alias)
        )

        match = re.search(
            compact_alias,
            text,
            flags=re.IGNORECASE
        )

        if match:

            value = text[
                match.end():
            ].strip(
                " :：|-"
            )

            if value:

                # 예:
                # 동물명(동물등록번호)
                # 여기서 (동물등록번호)를 동물명으로
                # 잘못 처리하는 것을 방지
                if (
                    value.startswith("(")
                    and
                    value.endswith(")")
                ):
                    return None

                return value

        # -----------------------------------------------------
        # 단일 단어 라벨
        # -----------------------------------------------------

        normalized_text = (
            self.normalize(text)
        )

        normalized_alias = (
            self.normalize(alias)
        )

        if (
            normalized_text.startswith(
                normalized_alias
            )
            and
            len(alias.split()) == 1
        ):

            parts = text.split(
                maxsplit=1
            )

            if len(parts) == 2:

                value = (
                    parts[1]
                    .strip()
                )

                if value:
                    return value

        return None

    # =========================================================
    # 분리된 라벨 결합
    # =========================================================

    def merge_split_labels(
        self,
        blocks
    ):

        result = list(
            blocks
        )

        for i in range(
            len(blocks)
        ):

            a = blocks[i]

            for j in range(
                i + 1,
                min(
                    i + 3,
                    len(blocks)
                )
            ):

                b = blocks[j]

                vertical_distance = abs(
                    a["center_y"]
                    - b["center_y"]
                )

                if vertical_distance > 45:
                    continue

                horizontal_gap = (
                    b["x1"]
                    - a["x2"]
                )

                if horizontal_gap > 100:
                    continue

                combined = (
                    a["text"]
                    + " "
                    + b["text"]
                )

                field, _ = (
                    self.detect_label(
                        combined
                    )
                )

                if field is None:
                    continue

                x1 = min(
                    a["x1"],
                    b["x1"]
                )

                y1 = min(
                    a["y1"],
                    b["y1"]
                )

                x2 = max(
                    a["x2"],
                    b["x2"]
                )

                y2 = max(
                    a["y2"],
                    b["y2"]
                )

                result.append({
                    "text": combined,

                    "confidence": min(
                        a["confidence"],
                        b["confidence"]
                    ),

                    "bbox": [],

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
                })

        result.sort(
            key=lambda block: (
                block["center_y"],
                block["center_x"]
            )
        )

        return result

    # =========================================================
    # 라벨 목록
    # =========================================================

    def find_labels(
        self,
        blocks
    ):

        labels = []

        for index, block in enumerate(
            blocks
        ):

            field, alias = (
                self.detect_label(
                    block["text"]
                )
            )

            if field is None:
                continue

            labels.append({
                "index": index,
                "field": field,
                "alias": alias,
                "block": block
            })

        return labels

    def is_label(
        self,
        block
    ):

        field, _ = (
            self.detect_label(
                block["text"]
            )
        )

        return field is not None

    # =========================================================
    # 같은 행 오른쪽 값
    # =========================================================

    def values_on_right(
        self,
        label_block,
        blocks
    ):

        candidates = []

        for block in blocks:

            if block is label_block:
                continue

            if self.is_label(
                block
            ):
                continue

            if not self.same_row(
                label_block,
                block
            ):
                continue

            # 반드시 라벨 오른쪽
            if (
                block["center_x"]
                <=
                label_block["center_x"]
            ):
                continue

            distance = max(
                0,
                block["x1"]
                - label_block["x2"]
            )

            candidates.append(
                (
                    distance,
                    block
                )
            )

        candidates.sort(
            key=lambda item: (
                item[0],
                item[1]["center_x"]
            )
        )

        return [
            item[1]
            for item
            in candidates
        ]

    # =========================================================
    # 다음 라벨 Y 좌표
    # =========================================================

    def next_label_y(
        self,
        current_label,
        labels
    ):

        current_y = (
            current_label[
                "block"
            ][
                "center_y"
            ]
        )

        following = []

        for label in labels:

            y = (
                label[
                    "block"
                ][
                    "center_y"
                ]
            )

            if y > current_y + 10:
                following.append(
                    y
                )

        if not following:
            return None

        return min(
            following
        )

    # =========================================================
    # 라벨 아래 값
    # =========================================================

    def values_below(
        self,
        label,
        blocks,
        labels
    ):

        label_block = (
            label["block"]
        )

        start_y = (
            label_block[
                "center_y"
            ]
        )

        end_y = (
            self.next_label_y(
                label,
                labels
            )
        )

        if end_y is None:

            end_y = (
                start_y
                + max(
                    self.height(
                        label_block
                    ) * 5,
                    180
                )
            )

        candidates = []

        for block in blocks:

            if block is label_block:
                continue

            if self.is_label(
                block
            ):
                continue

            cy = block[
                "center_y"
            ]

            if cy <= start_y + 5:
                continue

            if cy >= end_y - 5:
                continue

            candidates.append(
                block
            )

        candidates.sort(
            key=lambda block: (
                block["center_y"],
                block["center_x"]
            )
        )

        return candidates

    # =========================================================
    # 일반 단일 값
    # =========================================================

    def extract_single_value(
        self,
        label,
        blocks,
        labels
    ):

        block = (
            label["block"]
        )

        alias = (
            label["alias"]
        )

        # -----------------------------------------------------
        # 1. 같은 OCR 블록
        # -----------------------------------------------------

        inline = (
            self.extract_inline_value(
                block["text"],
                alias
            )
        )

        if inline:

            field, _ = (
                self.detect_label(
                    inline
                )
            )

            if field is None:
                return inline

        # -----------------------------------------------------
        # 2. 같은 행 오른쪽
        # -----------------------------------------------------

        right = (
            self.values_on_right(
                block,
                blocks
            )
        )

        if right:

            nearest = (
                right[0]
            )

            gap = max(
                0,
                nearest["x1"]
                - block["x2"]
            )

            # 다른 표 칸을 값으로 가져오는 것 방지
            max_gap = max(
                self.width(block)
                * 3,
                250
            )

            if gap <= max_gap:
                return nearest[
                    "text"
                ]

        # 단일 값은 함부로 다음 행에서
        # 가져오지 않는다.
        return None

    # =========================================================
    # 병명의 보조 라벨인지 검사
    # =========================================================

    def is_disease_meta_label(
        self,
        text
    ):

        normalized = (
            self.normalize(
                text
            )
        )

        for meta in (
            self.disease_meta_labels
        ):

            normalized_meta = (
                self.normalize(
                    meta
                )
            )

            if (
                normalized_meta
                in normalized
            ):
                return True

        return False

    # =========================================================
    # 여러 줄 값
    # =========================================================

    def extract_multiline_value(
        self,
        label,
        blocks,
        labels
    ):

        block = (
            label["block"]
        )

        alias = (
            label["alias"]
        )

        field = (
            label["field"]
        )

        values = []

        # -----------------------------------------------------
        # 1. 같은 OCR 블록
        # -----------------------------------------------------

        inline = (
            self.extract_inline_value(
                block["text"],
                alias
            )
        )

        if inline:

            detected_field, _ = (
                self.detect_label(
                    inline
                )
            )

            if detected_field is None:

                if not (
                    field
                    == "disease_name"
                    and
                    self.is_disease_meta_label(
                        inline
                    )
                ):
                    values.append(
                        inline
                    )

        # -----------------------------------------------------
        # 2. 같은 행 오른쪽
        # -----------------------------------------------------

        right = (
            self.values_on_right(
                block,
                blocks
            )
        )

        for candidate in right:

            text = (
                candidate[
                    "text"
                ]
            )

            if (
                field
                == "disease_name"
                and
                self.is_disease_meta_label(
                    text
                )
            ):
                continue

            if text not in values:

                values.append(
                    text
                )

        # -----------------------------------------------------
        # 3. 다음 주요 라벨 전까지
        # -----------------------------------------------------

        below = (
            self.values_below(
                label,
                blocks,
                labels
            )
        )

        for candidate in below:

            text = (
                candidate[
                    "text"
                ]
            )

            detected_field, _ = (
                self.detect_label(
                    text
                )
            )

            if detected_field is not None:
                continue

            if (
                field
                == "disease_name"
                and
                self.is_disease_meta_label(
                    text
                )
            ):
                continue

            if text not in values:

                values.append(
                    text
                )

        if not values:
            return None

        return " ".join(
            values
        )

    # =========================================================
    # NOTES / 비고
    # =========================================================

    def extract_notes(
        self,
        label,
        blocks
    ):

        """
        비고/그 밖의 사항은 문서 하단의
        법률 안내문을 잘못 가져오기 쉬움.

        따라서 같은 OCR 박스 또는
        같은 행 오른쪽 값만 사용한다.
        """

        block = (
            label["block"]
        )

        alias = (
            label["alias"]
        )

        # 같은 블록
        inline = (
            self.extract_inline_value(
                block["text"],
                alias
            )
        )

        if inline:
            return inline

        # 같은 행 오른쪽
        right = (
            self.values_on_right(
                block,
                blocks
            )
        )

        if not right:
            return None

        values = []

        for candidate in right:

            text = candidate[
                "text"
            ]

            if text not in values:

                values.append(
                    text
                )

        if not values:
            return None

        return " ".join(
            values
        )

    # =========================================================
    # 날짜 정규화
    # =========================================================

    @staticmethod
    def normalize_date(
        text
    ):

        if not text:
            return None

        # -----------------------------------------------------
        # 2025년 10월 31일
        # -----------------------------------------------------

        match = re.search(
            r"(20\d{2})\s*년\s*"
            r"(\d{1,2})\s*월\s*"
            r"(\d{1,2})\s*일",
            text
        )

        if match:

            year, month, day = (
                match.groups()
            )

            return (
                f"{int(year):04d}-"
                f"{int(month):02d}-"
                f"{int(day):02d}"
            )

        # -----------------------------------------------------
        # 2025.10.31
        # 2025-10-31
        # 2025/10/31
        # -----------------------------------------------------

        match = re.search(
            r"(20\d{2})\s*"
            r"[./\-]\s*"
            r"(\d{1,2})\s*"
            r"[./\-]\s*"
            r"(\d{1,2})",
            text
        )

        if match:

            year, month, day = (
                match.groups()
            )

            return (
                f"{int(year):04d}-"
                f"{int(month):02d}-"
                f"{int(day):02d}"
            )

        return None

    # =========================================================
    # 날짜 필드
    # =========================================================

    def extract_date(
        self,
        label,
        blocks,
        labels
    ):

        block = (
            label["block"]
        )

        # -----------------------------------------------------
        # 1. 같은 OCR 블록
        # -----------------------------------------------------

        inline = (
            self.extract_inline_value(
                block["text"],
                label["alias"]
            )
        )

        if inline:

            date = (
                self.normalize_date(
                    inline
                )
            )

            if date:
                return date

        # -----------------------------------------------------
        # 2. 같은 행 오른쪽
        # -----------------------------------------------------

        right = (
            self.values_on_right(
                block,
                blocks
            )
        )

        if right:

            text = " ".join(
                item["text"]
                for item
                in right
            )

            date = (
                self.normalize_date(
                    text
                )
            )

            if date:
                return date

        # -----------------------------------------------------
        # 3. 아래쪽 날짜 조각
        # -----------------------------------------------------

        below = (
            self.values_below(
                label,
                blocks,
                labels
            )
        )

        if below:

            text = " ".join(
                item["text"]
                for item
                in below[:5]
            )

            date = (
                self.normalize_date(
                    text
                )
            )

            if date:
                return date

        return None

    # =========================================================
    # 문서 하단 작성일 탐색
    # =========================================================

    def find_document_date(
        self,
        blocks
    ):

        """
        '작성일'이라는 라벨 없이

        2026년 9월 28일

        처럼 문서 하단에 날짜만 있는
        진단서도 처리한다.
        """

        if not blocks:
            return None

        max_y = max(
            block["center_y"]
            for block in blocks
        )

        # 문서 아래쪽 40%
        threshold = (
            max_y * 0.60
        )

        bottom_blocks = [
            block
            for block in blocks
            if (
                block["center_y"]
                >= threshold
            )
        ]

        # -----------------------------------------------------
        # 비슷한 Y 좌표끼리 행 생성
        # -----------------------------------------------------

        rows = []

        for block in bottom_blocks:

            placed = False

            for row in rows:

                if abs(
                    row[0]["center_y"]
                    - block["center_y"]
                ) <= 25:

                    row.append(
                        block
                    )

                    placed = True
                    break

            if not placed:

                rows.append(
                    [block]
                )

        dates = []

        for row in rows:

            row.sort(
                key=lambda block:
                block["center_x"]
            )

            text = " ".join(
                block["text"]
                for block
                in row
            )

            date = (
                self.normalize_date(
                    text
                )
            )

            if date:

                average_y = sum(
                    block["center_y"]
                    for block
                    in row
                ) / len(row)

                dates.append(
                    (
                        average_y,
                        date
                    )
                )

        if not dates:
            return None

        # 가장 아래쪽의 날짜 사용
        dates.sort(
            key=lambda item:
            item[0]
        )

        return dates[-1][1]

    # =========================================================
    # 등록번호
    # =========================================================

    @staticmethod
    def extract_registration_number(
        value
    ):

        if not value:
            return None

        match = re.search(
            r"\b\d[\d\- ]{8,18}\d\b",
            value
        )

        if not match:
            return None

        return re.sub(
            r"\D",
            "",
            match.group()
        )

    # =========================================================
    # 전체 Parsing
    # =========================================================

    def parse(
        self,
        ocr_result
    ):

        original_blocks = (
            ocr_result[
                "blocks"
            ]
        )

        blocks = (
            self.merge_split_labels(
                original_blocks
            )
        )

        labels = (
            self.find_labels(
                blocks
            )
        )

        result = {
            field: None
            for field
            in self.aliases.keys()
        }

        # -----------------------------------------------------
        # 필드별 값 추출
        # -----------------------------------------------------

        for label in labels:

            field = (
                label["field"]
            )

            # 이미 값을 얻은 경우
            if (
                result[field]
                is not None
            ):
                continue

            # 날짜
            if field in DATE_FIELDS:

                value = (
                    self.extract_date(
                        label,
                        blocks,
                        labels
                    )
                )

            # 비고
            elif field == "notes":

                value = (
                    self.extract_notes(
                        label,
                        blocks
                    )
                )

            # 여러 줄
            elif field in MULTILINE_FIELDS:

                value = (
                    self.extract_multiline_value(
                        label,
                        blocks,
                        labels
                    )
                )

            # 일반 단일 값
            else:

                value = (
                    self.extract_single_value(
                        label,
                        blocks,
                        labels
                    )
                )

            result[field] = (
                self.clean_value(
                    value
                )
            )

        # -----------------------------------------------------
        # 작성일 라벨이 없는 문서
        # -----------------------------------------------------

        if (
            result.get(
                "document_date"
            )
            is None
        ):

            result[
                "document_date"
            ] = (
                self.find_document_date(
                    original_blocks
                )
            )

        # -----------------------------------------------------
        # 동물명 안에 등록번호가 섞여 있는 경우
        # -----------------------------------------------------

        animal_name = (
            result.get(
                "animal_name"
            )
        )

        if animal_name:

            registration = (
                self.extract_registration_number(
                    animal_name
                )
            )

            if registration:

                if (
                    result.get(
                        "registration_number"
                    )
                    is None
                ):

                    result[
                        "registration_number"
                    ] = (
                        registration
                    )

        return result