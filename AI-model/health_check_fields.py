FIELD_ALIASES = {
    "species": [
        "종류",
        "동물종",
        "동물 종류",
        "축종"
    ],

    "breed": [
        "품종",
        "견종",
        "묘종",
        "동물 품종"
    ],

    "animal_name": [
        "동물명",
        "동물 이름",
        "동물이름",
        "환자명",
        "반려동물명"
    ],

    "registration_number": [
        "동물등록번호",
        "등록번호"
    ],

    "gender": [
        "성별",
        "성별/중성화",
        "성별(중성화 여부)"
    ],

    "age": [
        "연령",
        "나이",
        "동물 연령"
    ],

    "coat_color": [
        "털색",
        "털 색",
        "모색"
    ],

    "features": [
        "특징",
        "특이사항",
        "특이 사항"
    ],

    "disease_name": [
        "병명",
        "진단명",
        "질병명",
        "상병명",
        "진단 병명"
    ],

    "onset_date": [
        "발병 연월일",
        "발병연월일",
        "발병일",
        "발병(발견) 연월일",
        "발병(발견)연월일",
        "발견일",
        "증상 발생일"
    ],

    "diagnosis_date": [
        "진단 연월일",
        "진단연월일",
        "진단일",
        "진료일"
    ],

    "symptoms": [
        "주요 증상",
        "주요증상",
        "임상 증상",
        "임상증상",
        "증상"
    ],

    "treatment": [
        "치료명칭",
        "치료 명칭",
        "치료내용",
        "치료 내용",
        "처치내용",
        "처치 내용",
        "치료"
    ],

    "hospitalization_discharge_date": [
        "입원·퇴원일",
        "입원-퇴원일",
        "입원퇴원일",
        "입퇴원일",
        "입원 및 퇴원일"
    ],

    "prognosis": [
        "예후 소견",
        "예후소견",
        "예후",
        "향후 소견"
    ],

    "notes": [
        "그 밖의 사항",
        "그밖의 사항",
        "그밖의사항",
        "기타사항",
        "기타 사항",
        "비고"
    ],

    "document_date": [
        "작성일",
        "작성 일자",
        "발급일",
        "발급 일자",
        "진단서 작성일"
    ]
}


MULTILINE_FIELDS = {
    "disease_name",
    "symptoms",
    "treatment",
    "prognosis",
    "notes"
}


DATE_FIELDS = {
    "onset_date",
    "diagnosis_date",
    "hospitalization_discharge_date",
    "document_date"
}