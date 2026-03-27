# Front-End
건강하개 똑똑하개 (SmartHealthDog) 프론트엔드 레포입니다.

네 👍
딱 **README에 그대로 복붙 가능한 최종본**으로 깔끔하게 합쳐드리겠습니다.

````markdown
# 🚀 로컬 실행 방법

## 📌 환경
- Node.js >= 20

## 📦 의존성 설치
```bash
npm ci
````

## 🤖 Android 실행

> ❗ 에뮬레이터 또는 기기 먼저 실행 필수

```bash
adb devices
```

👉 `device` 상태 확인 후

```bash
npm run android
```

## 🍎 iOS 실행 (Mac)

```bash
cd ios
pod install
cd ..
npm run ios
```

## ⚙️ Metro 서버만 실행

```bash
npm run start
```

## ⚙️ 환경변수 설정 (Windows)

`adb` 명령어가 안 될 경우 아래 경로를 PATH에 추가하세요.

```
C:\Users\사용자명\AppData\Local\Android\Sdk\platform-tools
```

### 설정 방법

1. Windows 검색 → "환경 변수" 검색
2. **시스템 환경 변수 편집** 클릭
3. **환경 변수(N)...** 클릭
4. 사용자 변수 → `Path` → 편집
5. 새로 만들기 → 위 경로 추가

### 확인

```bash
adb version
```

👉 정상 출력되면 완료

## ❗ 문제 해결

```bash
adb kill-server
adb start-server
npm start -- --reset-cache
```

## 💡 참고

* `node_modules`는 `npm ci`로 생성
* Android Studio에서 에뮬레이터 먼저 실행
* `adb devices`에서 반드시 `device` 상태 확인


## Contributors 소개 (2025)
* **정서** - *서비스 개발, 와이어프레임 구성* - [sumhillj](https://github.com/sumhillj)
* **이서영** - *서비스 개발, 디자인* - [seoyoung0822](https://github.com/seoyoung0822)
