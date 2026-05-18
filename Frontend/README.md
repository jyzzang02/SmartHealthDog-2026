## SmartHealthDog Frontend

건강하개 똑똑하개 (SmartHealthDog) 프론트엔드 레포입니다.

## 1) 사전 요구사항

- Node.js `>= 20`
- Android Studio 설치
- Android SDK 기본 경로 사용
  - `C:\Users\<사용자명>\AppData\Local\Android\Sdk`

## 2) 최초 1회 설정

### 2-1. 의존성 설치

```bash
npm ci
```

### 2-2. ADB 명령 인식 설정 (Windows)

사용자 환경변수 `Path`에 아래를 추가합니다.

```text
C:\Users\<사용자명>\AppData\Local\Android\Sdk\platform-tools
```

필요하면 `ANDROID_SDK_ROOT`도 같은 SDK 루트로 설정합니다.

```text
C:\Users\<사용자명>\AppData\Local\Android\Sdk
```

### 2-3. `local.properties` 확인

`Frontend/android/local.properties` 파일에 SDK 경로를 명시합니다.

```properties
sdk.dir=C:\\Users\\<사용자명>\\AppData\\Local\\Android\\Sdk
```

> 이 파일은 로컬 전용이며 `.gitignore`에 포함되어 있으므로 커밋하지 않습니다.

## 3) 실행 순서 (표준)

1. Android Studio에서 에뮬레이터(또는 실제 기기) 먼저 실행
2. 명령은 `Frontend` 폴더에서 실행 (`SmartHealthDog-2026` 루트에서는 먼저 `cd Frontend`)

```bash
adb version
adb devices
npm run android
```

루트(`SmartHealthDog-2026`)에서 바로 실행하려면:

```bash
npm --prefix Frontend run android
```

`adb devices`에서 상태가 `device`이면 정상입니다.

## 4) Metro만 실행할 때

```bash
npm run start
```

캐시 초기화가 필요하면:

```bash
npm run start-clean
```

## 5) 문제 해결

### 케이스 A: `adb` 명령을 못 찾음

1. `Path`에 `platform-tools`가 있는지 확인
2. Android Studio/터미널 완전 종료 후 재실행
3. 재확인

```bash
adb version
```

### 케이스 B: `SDK location not found`

1. `Frontend/android/local.properties` 생성/확인
2. 아래 값이 맞는지 확인

```properties
sdk.dir=C:\\Users\\<사용자명>\\AppData\\Local\\Android\\Sdk
```

3. 필요 시 `ANDROID_SDK_ROOT`도 동일 경로로 설정

### 케이스 C: 기기 인식 이상/설치 실패

```bash
adb kill-server
adb start-server
adb devices
npm run android
```

