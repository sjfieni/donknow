# duckduck

토스의 단순한 화면 구성을 참고한 iPhone용 할 일 관리·개인 비서 앱입니다. 비서의 애칭은 덕이며, 하단 메뉴는 **캘린더 / Todo 리스트 / duckduck / log / 내정보**입니다. 토스와 제휴하거나 공식 자산을 사용하지 않습니다.

## 구성

- `mobile/`: React Native·Expo SDK 58 기반 iPhone 앱. [실행 안내](mobile/README.md).
- `server.js`, `server/`: 회원가입·로그인·계정별 Todo API. Node.js 24 이상. 먼저 루트에서 `npm ci`로 서버 의존성을 설치합니다.
- `public/`: 같은 서버에서 실행하는 웹 화면. HttpOnly 쿠키로 로그인합니다.
- `artifacts/duckduck-preview.html`: 로그인 없이 예시 데이터를 확인하는 독립 HTML 체험판. 서버 계정과 분리됩니다.

## 서버 실행

```sh
npm start
```

기본 포트는 3000이며 `PORT`로 변경할 수 있습니다. 처음 웹을 열면 회원가입/로그인 화면이 나타납니다. 이메일과 10~128자의 비밀번호로 계정을 만들 수 있습니다. 이메일 인증·비밀번호 재설정·계정 삭제 화면과 API를 제공합니다. 실제 인증 메일은 Resend 설정 후 사용할 수 있습니다. 로그인용 Apple/Google 소셜 로그인은 별도입니다.

Todo는 `data/duckduck.sqlite`에 계정별로 저장하며 서버 재시작 후에도 유지됩니다. `DATA_DIR`로 저장 위치를 변경할 수 있습니다. 데이터와 로그인 정보는 Git에 포함하지 않습니다. SQLite 파일과 WAL 파일을 함께 보존할 수 있는 저장 볼륨을 사용해야 합니다. 실행 중에도 `npm run backup`으로 서명·무결성을 확인한 스냅샷을 만들 수 있습니다. 복원은 원래 암호화 키와 함께 새로운 디렉터리에서만 진행합니다. 현재 클라우드 개발 머신에서의 보관과 공개 서비스의 영구 저장소 운영은 별개입니다.

비밀번호는 무작위 salt를 사용하는 scrypt 해시로 저장합니다. 세션은 30일 뒤 만료되고 로그아웃 시 폐기합니다. 서버에는 세션 토큰의 SHA-256 해시만 보관합니다. 로그인이 필요한 API는 계정 소유권을 확인하고, 다른 계정의 Todo ID를 지정해도 조회·수정·삭제할 수 없습니다. 네이티브 앱은 SecureStore의 토큰을 Bearer 헤더에 사용하고, 웹은 HttpOnly·SameSite=Strict 쿠키를 사용합니다.

공개 HTTPS 운영 시 `NODE_ENV=production` 또는 `COOKIE_SECURE=1`로 Secure 쿠키를 활성화하고, `PUBLIC_ORIGIN=https://실제서비스호스트`를 지정합니다. 임의 Origin이나 `X-Forwarded-For`를 신뢰하지 않습니다. 로그인/회원가입은 연결 IP 기준 15분당 30회로 제한합니다. 프록시 뒤의 운영 환경에서는 실제 클라이언트 IP 처리와 운영 정책을 별도로 정해야 합니다. 웹 UI와 API는 같은 사이트에서 제공하는 구성을 권장합니다. 물리 아이폰 연결에는 아이폰에서 접근 가능한 HTTPS 서버가 필요하며 이 작업에서 공개 배포 주소를 만들지는 않았습니다.

## 기존 할 일 보존

이전 `data/todos.json`은 원본 그대로 보존합니다. 새 계정에 자동 노출하거나 최초 가입자에게 임의로 배정하지 않습니다. 본인이 사용할 계정을 만든 뒤 서버 운영자가 아래 명령으로 해당 계정에 한 번만 가져올 수 있습니다.

```sh
npm run data:import -- --email 가져올계정이메일
```

가져오기는 원본 파일을 수정하지 않으며 중복 실행해도 중복 추가되지 않습니다. 기존 파일을 어느 계정에 배정할지는 자동으로 결정하지 않습니다.

## Todo와 log

Todo 행을 좌우로 스와이프하거나 체크 버튼을 누르면 완료 상태가 바뀝니다. 완료 후 4초 동안 되돌릴 수 있고, 이후 목록에서 숨겨집니다. 삭제하지 않으며 log 탭에서 모든 완료 항목과 완료 시각을 보고 미완료로 복원할 수 있습니다. 예정일이 있는 Todo는 캘린더에도 표시됩니다. 덕에서 입력한 내용을 선택해 Todo로 추가할 수 있습니다.

## 검증

```sh
npm run check
npm test
npm --prefix mobile run typecheck
npm --prefix mobile run export:web -- --max-workers 2
npm --prefix mobile run test:e2e
npm --prefix mobile run test:web-auth
npm --prefix mobile run export:ios -- --max-workers 2
```

서버 테스트는 임시 폴더와 임의 포트를 사용하며 실제 데이터를 건드리지 않습니다. 브라우저 검증은 Chromium이 필요합니다. iOS export는 Hermes 번들 생성 검증이며 서명된 설치 파일이나 실기기 실행을 뜻하지 않습니다.

## HTML 체험판

```sh
npm run preview:build
```

생성된 `artifacts/duckduck-preview.html`을 브라우저에서 열면 서버 없이 화면을 체험할 수 있습니다. 예시 데이터와 변경 내용은 브라우저의 별도 저장 공간에 보관하고 서버 데이터와 합치지 않습니다. 파일 URL에서 저장이 제한되는 브라우저에서는 새로고침 후 변경 내용이 사라질 수 있습니다. AI 대화와 iPhone 배포는 보류 상태입니다. Google·Slack·Notion 연결은 구현했지만 실제 OAuth 앱 등록·비밀 설정·사용자 승인이 필요합니다. 독립 HTML 체험판은 서버 연결 없이 예시 화면을 보여주는 용도입니다.


## 추가한 운영·연결 기능

- Todo 알림 시간과 기기별 로컬 알림 예약/취소. 웹은 시간 저장만 지원합니다.
- 이메일 인증, 비밀번호 재설정, 현재 비밀번호로 확인하는 계정 삭제.
- Google(기본 캘린더·Gmail·Drive), Slack, Notion OAuth와 선택적 Todo 가져오기. 읽기 권한과 계정별 자료를 분리하고 페이지 이동·중복 방지·연결 해제를 지원합니다.
- Docker/Compose·Caddy HTTPS·비공개 영구 볼륨, 자동 서명 백업과 새 디렉터리 복원, 선택적 S3 외부 보관.

실제 호스트·도메인·이메일 발송 계정·OAuth 앱·S3 버킷은 아직 없습니다. 코드/모의 검증과 외부 서비스 활성화는 다릅니다. 필요한 등록·환경 변수·운영 절차는 [운영 안내](docs/operations.md)를 참고하세요.

## 테스트 서버 배포

GitHub 코드를 Render에서 배포할 수 있도록 `render.yaml`을 추가했습니다. 별도 도메인 없이 제공 주소를 사용하며 영구 디스크가 포함된 유료 구성입니다. 실제 서비스 생성 전 비용 확인이 필요합니다. [간단한 배포 순서](docs/test-deployment.md)를 참고하세요. 자동 재배포는 꺼져 있으며 이메일·OAuth·외부 백업은 별도 설정입니다.
