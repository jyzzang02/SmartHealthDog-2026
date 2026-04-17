import numpy as np 
import cv2
from math import sqrt
from typing import Dict, Tuple, Union

import requests

def closest_color(COLORS , r,g,b):
    # 기존 closest_color 함수는 유지합니다.
    # 단, 아래 진단 로직에서는 이 함수 대신 새로운 closest_color_from_ref_table 함수를 사용합니다.
    color_diffs = []
    for color in COLORS:
        cr = color[0]
        cg = color[1]
        cb = color[2]
        color_diff = sqrt((int(r )- cr)**2 + (int(g) - cg)**2 + (int(b) - cb)**2)
        color_diffs.append((color_diff, color))
    return min(color_diffs)[1]

def nearest_colour( subjects, query ):
    return min( subjects, key = lambda subject: sum( (s - q) ** 2 for s, q in zip( subject, query ) ) )

# ----------------------------------------------------
# 사용자가 제공한 REFERENCE_COLOR_TABLE 및 매핑 정보 추가
# ----------------------------------------------------

REFERENCE_COLOR_TABLE: Dict[str, Dict[str, Tuple[int, int, int]]] = {
    "Leukocytes": {
        "Neg.": (168, 165, 140),
        "Trace 15": (158, 150, 141),
        "Small 70": (159, 143, 139),
        "Moderate 125": (152, 123, 145),
        "Large 500": (128, 95, 137),
    },
    "Nitrite": {
        "Neg.": (169, 166, 161),
        "Positive": (175, 152, 158),
    },
    "Urobilinogen": {
        "Normal": (175, 166, 152),
        "16": (173, 135, 124),
        "Trace 32": (169, 97, 93),
        "64+": (171, 86, 79),
        "128+": (169, 70, 65),
    },
    "Protein": {
        "Neg.": (164, 159, 94),
        "Trace": (147, 157, 97),
        "0.3": (137, 154, 109),
        "1.0": (113, 151, 130),
        "3.0": (122, 155, 154),
        "20.0": (101, 149, 137),
    },
    "pH": {
        "5.0": (172, 136, 43),
        "6.0": (144, 130, 25),
        "6.5": (120, 126, 29),
        "7.0": (101, 109, 34),
        "7.5": (79, 105, 34),
        "8.0": (56, 94, 33),
        "8.5": (1, 108, 139),
    },
    "Blood": {
        "Neg.": (176, 132, 72),
        "Non hemolyzed 10": (167, 130, 66),
        "Hemolyzed 10": (161, 125, 28),
        "25 Small": (136, 121, 34),
        "80 Moderate": (82, 112, 43),
        "200 Large": (20, 79, 31),
    },
    "Specific Gravity": {
        "1.000": (2, 107, 106),
        "1.005": (62, 96, 65),
        "1.010": (88, 106, 49),
        "1.015": (130, 122, 49),
        "1.020": (150, 134, 49),
        "1.025": (167, 138, 38),
        "1.030": (175, 144, 47),
    },
    "Ketone": {
        "Neg.": (180, 137, 120),
        "Trace 0.5": (173, 116, 103),
        "Small 1.5": (169, 87, 97),
        "Moderate 4.0": (160, 35, 66),
        "8.0": (114, 16, 50),
        "Large 16": (85, 12, 48),
    },
    "Bilirubin": {
        "Neg.": (179, 175, 169),
        "Small 17": (172, 153, 129),
        "Moderate 50": (175, 155, 140),
        "Large 100": (178, 146, 134),
    },
    "Glucose": {
        "Neg.": (125, 155, 152),
        "Trace 5": (109, 149, 105),
        "15": (106, 122, 33),
        "30": (132, 105, 20),
        "60": (125, 67, 31),
        "110": (101, 42, 24),
    },
}

# resutls2D의 인덱스 (0-based)와 질병 키(Analyte Name) 매핑
ANALYTE_MAPPING = {
    0: "Urobilinogen",
    1: "Bilirubin",
    2: "Ketone",
    3: "Creatinine", 
    4: "Blood",
    5: "Protein",
    6: "Micro Albumin", 
    7: "Nitrite",
    8: "Leukocytes",
    9: "Glucose",
    10: "Specific Gravity",
    11: "pH",
    12: "Ascorbate", 
    13: "Calcium", 
}

def closest_color_from_ref_table(ref_colors: Dict[str, Tuple[int, int, int]], r, g, b) -> Tuple[str, Tuple[int, int, int]]:
    """
    주어진 참조표 딕셔너리에서 가장 유사한 색상 매치를 찾습니다.
    """
    min_diff = float('inf')
    best_match_key = ""
    best_match_rgb = (0, 0, 0)
    
    for key, (cr, cg, cb) in ref_colors.items():
        # 유클리드 거리 계산
        color_diff = sqrt((int(r) - cr)**2 + (int(g) - cg)**2 + (int(b) - cb)**2)
        
        if color_diff < min_diff:
            min_diff = color_diff
            best_match_key = key
            best_match_rgb = (cr, cg, cb)
            
    return best_match_key, best_match_rgb

# ----------------------------------------------------
# main logic
# ----------------------------------------------------

def check_urine(image_url: str) -> Dict[str, Union[str, Dict]]:
    #load the image
    image = None
    try:
        response = requests.get(image_url, timeout=10) # Set a timeout for the request
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)
        
        image_array = np.asarray(bytearray(response.content), dtype=np.uint8)

        # Decode image array to OpenCV image format
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
    except requests.exceptions.RequestException as e:
        return {"error": f"Failed to download image from {image_url}: {e}"}
    except Exception as e:
        return {"error": f"Failed to process downloaded image from {image_url}: {e}"}

    # grayscale
    gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray,(1,1),0)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15,15))
    opening = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel, iterations=1)

    # adaptive threshold
    thresh = cv2.adaptiveThreshold(opening,255,cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV,27,1)

    # Fill rectangular contours
    cnts = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnts = cnts[0] if len(cnts) == 2 else cnts[1]
    for c in cnts:
        cv2.drawContours(thresh, [c], -1, (255,255,255), -1)


    # Draw rectangles, the 'area_treshold' value was determined empirically
    cnts = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnts = cnts[0] if len(cnts) == 2 else cnts[1]
    area_treshold = 2000

    resutls1D = []
    resutls2D =[]

    h = 0
    w = 0
    for c in cnts:
        if cv2.contourArea(c) > area_treshold :
            x,y,w,h = cv2.boundingRect(c)
            if not( w < h +30 and w > h-30):
                continue
            cv2.rectangle(image, (x, y), (x + w, y + h), (36,255,12), 3)
            b,g,r = (image[(y + int(h/2)), (x + int(w/2))])
            resutls1D.append([r , g , b , x ,y])

    for i in range(0 , len(resutls1D)-1):
        swap = 0
        for x in range(i , len(resutls1D)-1):
            if(resutls1D[i][3] > resutls1D[x+1][3]):
                swap= resutls1D[i]
                resutls1D[i] = resutls1D[x+1]
                resutls1D[x+1] = swap

    # print(resutls1D)
    # print("************************************************************")

    resutls1Di = []
    for i in range( 0 , len(resutls1D)-1):
        resutls1Di.append(resutls1D[i])
        if (resutls1D[i+1][3]  - resutls1D[i][3] ) > 20 :
            resutls2D.append(resutls1Di)
            resutls1Di = []

    resutls1Di.append(resutls1D[len(resutls1D)-1])
    resutls2D.append(resutls1Di)

    for i in range(0 , len(resutls2D)):
        for j in range(0 , len(resutls2D[i])-1):
            swap = 0
            for x in range(j , len(resutls2D[i])-1):
                if(resutls2D[i][j][4] > resutls2D[i][x+1][4]):
                    swap= resutls2D[i][j]
                    resutls2D[i][j] = resutls2D[i][x+1]
                    resutls2D[i][x+1] = swap

    # 14개 라인을 맞추기 위한 빈 값 삽입 (샘플 스트립은 resutls2D[1]에 있다고 가정)
    resutls2D[0].insert(13, [0,0,0,0,0])  
    resutls2D[0].insert(1, [0,0,0,0,0]) 

    for i in range(0 , len(resutls2D)):
        for j in range(0 , len(resutls2D[i])-1):
            if(resutls2D[i][j + 1][4] - resutls2D[i][j][4]  > h) :
                x = resutls2D[i][j][3]
                y = resutls2D[i][j][4]
                cv2.rectangle(image,  (x, y + h),  (x + w, y + h +5) , (255,36,12), 3)

    # ----------------------------------------------------
    # 사용자 요청: REFERENCE_COLOR_TABLE을 활용한 진단 로직 (제외 항목 미표시)
    # ----------------------------------------------------

    # print("\n\n\n==================================================")
    # print("=== Urine Test Diagnosis Results ===")
    # print("==================================================")

    # resutls2D[1]이 샘플 스트립 결과라고 가정합니다.
    if len(resutls2D) > 1 and len(resutls2D[1]) == len(ANALYTE_MAPPING):
        return_results = []

        for line_index, sample_color_data in enumerate(resutls2D[1]):
            analyte_name = ANALYTE_MAPPING.get(line_index)
            
            # REFERENCE_COLOR_TABLE에 존재하는 항목만 처리합니다.
            if analyte_name in REFERENCE_COLOR_TABLE:
                
                # 샘플 색상 추출: [R, G, B, x, y] 형식입니다.
                r, g, b = sample_color_data[0], sample_color_data[1], sample_color_data[2]
                
                # print(f"\n--- Line {line_index + 1}: {analyte_name} ---")
                ref_colors = REFERENCE_COLOR_TABLE[analyte_name]
                
                # 참조표에서 가장 가까운 색상 매치 찾기
                diagnosis_key, matched_rgb = closest_color_from_ref_table(ref_colors, r, g, b)
                
                # 요청된 텍스트 출력
                # print(f"  Disease Key : {analyte_name}")
                # print(f"  Diagnosis Key : {diagnosis_key}")
                # print(f"  Reference RGB : {matched_rgb}")
                
                # 샘플 박스를 이미지에 파란색으로 하이라이트
                xAns, yAns = sample_color_data[3], sample_color_data[4]
                # w와 h는 위 컨투어 검출 루프에서 설정되었습니다.
                cv2.rectangle(image, (xAns, yAns), (xAns + w, yAns + h), (36, 12, 255), 3)
                # 결과를 딕셔너리 형태로 저장
                return_results.append({
                    "analyte": analyte_name,
                    "value": diagnosis_key,
                    "colorRGB": list(matched_rgb)
                })

        return {"results": return_results}
    else:
        # print("\n[ERROR] Sample strip (resutls2D[1]) not found or incorrect number of lines detected.")
        return {"error": "샘플 스트립을 찾을 수 없거나 감지된 라인 수가 올바르지 않습니다."}


# cv2.namedWindow("thresh", cv2.WINDOW_NORMAL) 
# thresh = cv2.resize(thresh, (960, 540))
# cv2.imshow('thresh', thresh)

# cv2.namedWindow("opening", cv2.WINDOW_NORMAL) 
# opening = cv2.resize(opening, (960, 540))
# cv2.imshow('opening', opening)

# cv2.namedWindow("image", cv2.WINDOW_NORMAL) 
# image = cv2.resize(image, (960, 540))
# cv2.imshow('image', image)

# cv2.waitKey()