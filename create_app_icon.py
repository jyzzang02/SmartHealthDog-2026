#!/usr/bin/env python3
"""
SmartHealthDog 앱 아이콘 생성 스크립트
- 파란색과 노란색 테마
- 개와 건강 관련 디자인
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_app_icon(output_path, size=1024):
    """
    앱 아이콘 생성 (파란색/노란색 테마)

    Args:
        output_path: 저장할 경로
        size: 아이콘 크기 (기본 1024x1024)
    """
    # 배경 생성 (그라디언트 효과 - 파란색에서 시작)
    img = Image.new('RGB', (size, size), color=(25, 103, 210))  # 파란색
    draw = ImageDraw.Draw(img, 'RGBA')

    # 노란색 섹터 추가 (오른쪽 상단)
    sector_size = int(size * 0.4)
    draw.rectangle(
        [(size - sector_size, 0), (size, sector_size)],
        fill=(252, 185, 11)  # 노란색
    )

    # 동그란 배경 (앱 아이콘 중심)
    circle_size = int(size * 0.7)
    circle_x = (size - circle_size) // 2
    circle_y = (size - circle_size) // 2

    # 흰색 반투명 원
    draw.ellipse(
        [(circle_x, circle_y), (circle_x + circle_size, circle_y + circle_size)],
        fill=(255, 255, 255, 200)
    )

    # 텍스트 추가 (강아지 모양 이모지와 텍스트)
    try:
        # 큰 텍스트 (Happy Dog)
        font_size = int(size * 0.15)
        # 이모지와 텍스트 사용
        text = "🐕"
        draw.text(
            (size // 2 - 60, size // 2 - 100),
            text,
            fill=(25, 103, 210),
            font=None
        )

        # 작은 텍스트 (SmartHealthDog)
        small_text = "S.H.D"
        draw.text(
            (size // 2 - 100, size // 2 - 10),
            small_text,
            fill=(25, 103, 210),
            font=None
        )
    except Exception as e:
        print(f"텍스트 그리기 실패: {e}")

    # 하트와 십자가 모양 추가 (건강 아이콘)
    # 하단 좌측: 하트 색상 (빨강)
    heart_x = int(size * 0.2)
    heart_y = int(size * 0.75)
    heart_size = int(size * 0.15)

    draw.ellipse(
        [(heart_x - heart_size//2, heart_y - heart_size//2),
         (heart_x, heart_y)],
        fill=(220, 20, 60)  # 빨강
    )

    # 하단 우측: 십자가 색상 (노랑)
    cross_x = int(size * 0.8)
    cross_y = int(size * 0.75)
    line_width = int(size * 0.04)

    # 십자가 그리기
    draw.rectangle(
        [(cross_x - line_width, cross_y - heart_size//2),
         (cross_x + line_width, cross_y + heart_size//2)],
        fill=(252, 185, 11)  # 노랑
    )
    draw.rectangle(
        [(cross_x - heart_size//2, cross_y - line_width),
         (cross_x + heart_size//2, cross_y + line_width)],
        fill=(252, 185, 11)  # 노랑
    )

    # 이미지 저장
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f"✓ 생성됨: {output_path} ({size}x{size})")

def create_all_icons():
    """모든 필요한 해상도의 아이콘 생성"""

    base_path = r"C:\Users\jyzzang02\Documents\GitHub\SmartHealthDog-2026\Frontend"

    # Android 아이콘 해상도
    android_sizes = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }

    print("\n=== Android 아이콘 생성 중... ===")
    for folder, size in android_sizes.items():
        output_path = os.path.join(
            base_path,
            f"android/app/src/main/res/{folder}/ic_launcher.png"
        )
        create_app_icon(output_path, size)

    # iOS 아이콘 해상도 (@2x, @3x 포함)
    ios_sizes = {
        'icon-20x20@2x.png': 40,
        'icon-20x20@3x.png': 60,
        'icon-29x29@2x.png': 58,
        'icon-29x29@3x.png': 87,
        'icon-40x40@2x.png': 80,
        'icon-40x40@3x.png': 120,
        'icon-60x60@2x.png': 120,
        'icon-60x60@3x.png': 180,
        'icon-1024x1024@1x.png': 1024,
    }

    print("\n=== iOS 아이콘 생성 중... ===")
    ios_path = os.path.join(
        base_path,
        "ios/SmartHealthDog/Images.xcassets/AppIcon.appiconset"
    )
    for filename, size in ios_sizes.items():
        output_path = os.path.join(ios_path, filename)
        create_app_icon(output_path, size)

    print("\n✅ 모든 아이콘 생성 완료!")

if __name__ == "__main__":
    create_all_icons()


