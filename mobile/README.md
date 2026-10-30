# duckduck iPhone 앱

React Native + Expo SDK 58 + TypeScript로 만든 iPhone 앱 기반입니다. 기존 HTML을 WebView에 넣지 않고 React Native 화면으로 구현했습니다. 현재 다섯 탭, Todo 편집·예정일 선택, 좌우 스와이프, 완료 후 4초 동안 되돌리기, log, 캘린더, 덕에서 Todo로 추가하는 흐름을 제공합니다.

## 개발 환경

Node.js 24 권장. 이 폴더에서 실행합니다.

```sh
npm ci
npm start
```

Expo Go는 이 프로젝트의 SDK 58을 지원하는 버전이어야 합니다. 같은 네트워크에서 접근 가능한 개발 머신에서 Metro를 실행한 뒤 아이폰의 Expo Go로 QR 코드를 엽니다. 클라우드 내부의 Metro 주소는 아이폰에서 바로 접근할 수 있는 공개 주소가 아닙니다. 이 작업에서는 공개 터널, 배포 주소, 설치 파일을 만들지 않았습니다.

Linux 클라우드에서는 iOS 시뮬레이터와 Xcode를 실행할 수 없습니다. `npm run ios`는 Xcode가 설치된 macOS에서 시뮬레이터를 여는 개발 명령입니다. JavaScript 번들 생성은 Linux에서도 가능합니다. TestFlight와 설치용 iOS 빌드는 Apple 서명 및 배포 설정을 정한 뒤 별도로 진행합니다. 앱 식별자와 Expo/EAS 프로젝트·계정은 임의로 등록하지 않았습니다.

## 저장 모드

처음 실행하면 저장 방법을 선택합니다.

- **클라우드 서버**: 기존 서버의 `GET/POST /api/todos`, `PATCH/DELETE /api/todos/:id`를 사용합니다. 접근 가능한 HTTPS 서버의 origin만 입력합니다. 연결 후 회원가입/로그인하면 할 일이 계정별 서버 저장소에 보관됩니다. 자동으로 체험 데이터로 전환하지 않습니다. 내정보 → 서버 연결 설정에서 변경할 수 있습니다.
- **체험 모드**: 예시 데이터와 변경 내용을 AsyncStorage에 기기별로 저장합니다. 서버 데이터와 분리되며 클라우드 동기화가 아닙니다. 재설치/앱 데이터 삭제로 사라질 수 있습니다.

`EXPO_PUBLIC_API_URL`을 빌드/개발 시 지정하면 최초 서버 기본값으로 사용합니다. 저장된 기기 설정이 우선합니다. Expo의 `EXPO_PUBLIC_*` 값은 앱에 포함되므로 비밀번호나 API 키를 넣으면 안 됩니다. 서버 주소는 비밀이 아닙니다. 물리 아이폰에서 `localhost`는 클라우드 서버가 아니라 아이폰 자신입니다. HTTP loopback은 개발 모드에서만 허용하며, 실제 연결에는 HTTPS 주소를 사용합니다.

이메일·비밀번호 회원가입/로그인과 계정별 Todo 접근 제어를 제공합니다. 서버는 DATA_DIR의 SQLite에 계정과 할 일을 저장합니다. 아이폰의 세션 토큰은 SecureStore에 보관하며 AsyncStorage에는 넣지 않습니다. 웹은 HttpOnly 쿠키를 사용합니다. 로그아웃과 세션 만료 시 화면의 이전 계정 데이터와 수정창을 지웁니다. 이메일 인증·비밀번호 재설정·계정 삭제와 배포용 볼륨·백업 구성을 추가했습니다. 실제 발송 서비스와 운영 호스트는 준비 후 활성화해야 합니다. OpenAI는 보류 상태이고 Google·Slack·Notion은 OAuth 승인 후 선택한 자료를 읽도록 구현했습니다. 실제 공급자 계정은 아직 연결하지 않았습니다. 덕은 입력을 Todo로 옮기는 UI이며 실제 AI 응답을 생성하지 않습니다.

## 검증

```sh
npm run typecheck
npm test
npm run export:ios -- --max-workers 2
npm run export:web -- --max-workers 2
npm run test:e2e
npm run test:web-auth
```

`test:e2e`는 먼저 생성한 `dist-web`의 실제 React Native Web 번들을 Chromium으로 실행합니다. 기본 브라우저 경로는 `/usr/bin/chromium`이며 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`로 바꿀 수 있습니다. 실제 Node API 서버를 임시 데이터 폴더와 임의 포트에 실행하고, 테스트 HTTPS origin의 요청만 그 서버에 전달합니다. 서버의 실제 개발 데이터와 기기의 실제 설정을 건드리지 않습니다. 스와이프·4초 타이머·log 복원·캘린더·덕→Todo·회원가입·로그인·계정별 서버 저장·새로고침 후 로그인 유지·로그아웃·다른 계정 분리·세션 만료·실패 복구를 확인합니다. test:web-auth는 기존 웹 UI에서도 쿠키 로그인과 계정 분리를 검증합니다. 이것은 iOS 기기에서 수행한 테스트는 아닙니다.

검증 산출물은 `dist-ios/`, `dist-web/`에 생성하며 Git에서는 제외합니다. iOS export의 `.hbc`는 Hermes 번들이며 아이폰 설치 파일(`.ipa`)이 아닙니다.

## 제한된 클라우드에서 실행

이 환경에서는 홈 디렉터리가 쓰기 제한되어 있으므로 캐시와 Expo 상태 위치를 명시합니다. Expo CLI가 제공하는 shell 전용 상태 디렉터리 설정을 사용하며 HOME이나 기존 인증 파일을 변경하지 않습니다.

```sh
npm ci --cache /workspace/.cache/npm
__UNSAFE_EXPO_HOME_DIRECTORY=/workspace/.cache/expo \
DOTSLASH_CACHE=/workspace/.cache/dotslash \
EXPO_NO_TELEMETRY=1 EXPO_NO_CACHE=1 \
npm start -- --offline --port 8091
```

`--offline`은 Metro의 외부 API 조회를 생략하며 앱의 HTTPS 서버 통신을 비활성화하지 않습니다. 클라우드 작업은 이미 격리되어 있으므로 기존 `/workspace/donknow` 체크아웃을 사용하고 별도 Git worktree를 만들지 않습니다. 캐시 경로에는 인증 상태가 생길 수 있으므로 저장소나 스크린샷에 포함하지 않습니다.


## 로그인 화면과 저장

클라우드 서버를 고른 다음 이메일·비밀번호로 로그인하거나 회원가입합니다. 비밀번호는 10~128자입니다. 계정이 없으면 ‘처음이에요 · 회원가입’을 누릅니다. 내정보에서 계정 이메일을 확인하고 로그아웃할 수 있습니다. 서버 주소별로 아이폰의 SecureStore에 로그인 토큰을 보관하며 다른 서버로 보내지 않습니다. 웹 내보내기에서는 UI와 API를 같은 사이트에서 제공해야 HttpOnly·SameSite=Strict 쿠키를 안정적으로 사용할 수 있습니다. Expo 웹 개발 서버와 별도 API origin의 조합은 별도 프록시 설정이 필요합니다. native API 요청은 이 브라우저 쿠키 제약과 다릅니다.

이메일 인증·비밀번호 재설정은 발송 큐와 함께 구현했고 실제 Resend 계정/발신 도메인 설정이 필요합니다. 소셜 로그인은 별도입니다. 서버 데이터 위치와 기존 todos.json의 명시적 가져오기는 루트 README를 참고하세요.


## 알림·외부 서비스·계정 관리

Todo 편집에서 알림 시간을 저장하고 내정보에서 기기 알림을 켭니다. Expo Notifications를 사용하며 완료·삭제·로그아웃 시 취소합니다. 가까운 60개부터 예약하고, 웹에서는 예약 시간을 저장하기만 합니다. 실제 기기에서 울리는지 검증하는 것은 iPhone 배포/실기기 단계에서 진행합니다.

내정보에서 이메일 인증, 비밀번호 재설정, 계정 삭제와 Google·Slack·Notion 연결을 관리합니다. 연결 항목에서 권한을 선택해 OAuth를 시작하고 승인한 자료를 Todo에 가져올 수 있습니다. 공급자 토큰은 서버에서 암호화하며 기기에는 전달하지 않습니다. OAuth 네이티브 복귀는 duckduck:// scheme을 등록한 개발/설치 빌드에서 확인해야 합니다. 현재는 외부 앱 등록/자격 증명이 없어 실제 연결을 활성화하지 않았습니다.

배포·발송 서비스 등록·OAuth callback·백업/키 보관은 [운영 안내](../docs/operations.md)를 참고하세요. AI 연결과 iPhone 배포 자체는 이번 작업에서 진행하지 않았습니다.

## App Store 출시 준비 — 2026-10-30

사용자 요청으로 iPhone 배포 보류를 해제했다. `eas.json`의 production 프로필은 기존 HTTPS API 주소를 기본값으로 포함하고 App Store 서명 빌드와 빌드 번호 증가를 설정한다. Apple/Expo 프로젝트·서명 연결은 아직 완료하지 않았다. Bundle ID `com.sjfieni.duckduck`은 등록 전 후보다. [출시 안내](../docs/ios-release.md)의 계정 연결·실기기 검증·심사 준비를 따른다. 기존 절의 미배포 설명은 당시 상태이며 서명 빌드 없이 iOS JS export만 통과했다.
