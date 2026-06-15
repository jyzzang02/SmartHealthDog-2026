import cv2
import numpy as np
from math import sqrt
from typing import Dict, Tuple, Union
import requests

# -----------------------------
# Reference Table
# -----------------------------
REFERENCE_COLOR_TABLE = {
    "Leukocytes": {"Neg.": (168,165,140),"Trace 15": (158,150,141),"Small 70": (159,143,139),"Moderate 125": (152,123,145),"Large 500": (128,95,137)},
    "Nitrite": {"Neg.": (169,166,161),"Positive": (175,152,158)},
    "Urobilinogen": {"Normal": (175,166,152),"16": (173,135,124),"Trace 32": (169,97,93),"64+": (171,86,79),"128+": (169,70,65)},
    "Protein": {"Neg.": (164,159,94),"Trace": (147,157,97),"0.3": (137,154,109),"1.0": (113,151,130),"3.0": (122,155,154),"20.0": (101,149,137)},
    "pH": {"5.0": (172,136,43),"6.0": (144,130,25),"6.5": (120,126,29),"7.0": (101,109,34),"7.5": (79,105,34),"8.0": (56,94,33),"8.5": (1,108,139)},
    "Blood": {"Neg.": (176,132,72),"Non hemolyzed 10": (167,130,66),"Hemolyzed 10": (161,125,28),"25 Small": (136,121,34),"80 Moderate": (82,112,43),"200 Large": (20,79,31)},
    "Specific Gravity": {"1.000": (2,107,106),"1.005": (62,96,65),"1.010": (88,106,49),"1.015": (130,122,49),"1.020": (150,134,49),"1.025": (167,138,38),"1.030": (175,144,47)},
    "Ketone": {"Neg.": (180,137,120),"Trace 0.5": (173,116,103),"Small 1.5": (169,87,97),"Moderate 4.0": (160,35,66),"8.0": (114,16,50),"Large 16": (85,12,48)},
    "Bilirubin": {"Neg.": (179,175,169),"Small 17": (172,153,129),"Moderate 50": (175,155,140),"Large 100": (178,146,134)},
    "Glucose": {"Neg.": (125,155,152),"Trace 5": (109,149,105),"15": (106,122,33),"30": (132,105,20),"60": (125,67,31),"110": (101,42,24)},
}

ANALYTE_ORDER = [
    "Urobilinogen","Bilirubin","Ketone","Blood","Protein",
    "Nitrite","Leukocytes","Glucose","Specific Gravity","pH"
]

# -----------------------------
# Color Matching (LAB)
# -----------------------------
def rgb_to_lab(color):
    arr = np.uint8([[color]])
    lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)[0][0]
    return lab

def closest_color_lab(ref_colors, r, g, b):
    sample_lab = rgb_to_lab((r,g,b))
    min_dist = float('inf')
    best_key = None
    best_rgb = None

    for key, rgb in ref_colors.items():
        ref_lab = rgb_to_lab(rgb)
        dist = np.linalg.norm(sample_lab - ref_lab)

        if dist < min_dist:
            min_dist = dist
            best_key = key
            best_rgb = rgb

    return best_key, best_rgb

# -----------------------------
# Strip Detection
# -----------------------------
def detect_strip(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5,5), 0)

    edges = cv2.Canny(blur, 50, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5,25))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    max_area = 0

    for c in cnts:
        rect = cv2.minAreaRect(c)
        w,h = rect[1]
        if w == 0 or h == 0:
            continue

        ratio = max(w,h)/min(w,h)

        if ratio > 5:
            area = cv2.contourArea(c)
            if area > max_area:
                max_area = area
                best = c

    if best is None:
        return None

    x,y,w,h = cv2.boundingRect(best)
    return image[y:y+h, x:x+w]

# -----------------------------
# Pad Detection
# -----------------------------
def detect_pads(strip):
    gray = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3,3), 0)

    thresh = cv2.adaptiveThreshold(
        blur,255,cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,21,5
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT,(5,5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    cnts,_ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    pads = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 300:
            continue

        x,y,w,h = cv2.boundingRect(c)
        ratio = w/float(h)

        if 0.7 < ratio < 1.3:
            pads.append((x,y,w,h))

    return sorted(pads, key=lambda x: x[1])

# -----------------------------
# Main Pipeline
# -----------------------------
def check_urine(image_url: str):

    # 1. load image
    try:
        res = requests.get(image_url, timeout=10)
        res.raise_for_status()
        img = cv2.imdecode(np.frombuffer(res.content, np.uint8), cv2.IMREAD_COLOR)
    except Exception as e:
        return {"error": str(e)}

    if img is None:
        return {"error": "이미지 디코딩 실패"}

    # 2. strip
    strip = detect_strip(img)
    if strip is None:
        return {"error": "스트립 검출 실패"}

    # 3. pads
    pads = detect_pads(strip)

    if len(pads) < 10:
        return {"error": f"패드 부족 ({len(pads)})"}

    # 4. 색상 추출
    results = []

    for i, (x,y,w,h) in enumerate(pads[:len(ANALYTE_ORDER)]):

        analyte = ANALYTE_ORDER[i]

        roi = strip[y:y+h, x:x+w]
        b,g,r = np.mean(roi, axis=(0,1))

        key, rgb = closest_color_lab(
            REFERENCE_COLOR_TABLE[analyte],
            int(r), int(g), int(b)
        )

        results.append({
            "analyte": analyte,
            "value": key,
            "colorRGB": list(rgb)
        })

    return {
        "results": results,
        "pad_count": len(pads)
    }