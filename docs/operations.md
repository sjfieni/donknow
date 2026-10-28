# 운영 준비 및 외부 서비스 활성화

AI 연결과 iPhone 배포는 이번 범위에서 제외한다. 아래 구성은 운영 서버를 준비한 뒤 활성화하는 절차이며, 이 저장소의 코드가 공개 호스트나 외부 계정을 자동 생성하지는 않는다.

## 현재 동작과 검증 범위

| 항목 | 구현 | 현재 검증 |
|---|---|---|
| 계정·Todo 저장 | SQLite WAL, 계정별 접근 제어, 영구 볼륨 구성 | 실제 API와 재시작 테스트 |
| 백업 | 실행 중 스냅샷, SHA-256·HMAC 검증, 보관 기간, 새 폴더 복원 | 실제 스냅샷·복원·손상/잘못된 키 거부 |
| 외부 백업 | S3 암호화 저장·체크섬·전용 prefix 보관 정리 | SDK 요청 모의 검증, 실제 버킷 미연결 |
| 이메일 인증·비밀번호 재설정 | 6자리 코드, 15분 유효, 5회 시도, 재전송 제한, 발송 큐·재시도 | 격리된 테스트 수신함과 HTTP 어댑터 검증 |
| 계정 삭제 | 현재 비밀번호·명시적 확인, 데이터·세션·연결 삭제 | 실제 API와 화면 테스트 |
| 할 일 알림 | 기기 권한, 날짜/시간, 예약·변경·취소, 완료/삭제/로그아웃 시 취소 | 계획·취소 어댑터 테스트, 실기기 미검증 |
| Google | OAuth+PKCE, 기본 캘린더·Gmail·Drive, 선택적 Todo 가져오기 | 공식 API 형태를 따른 모의 응답으로 검증 |
| Slack·Notion | OAuth, 읽기·페이지 이동·선택 가져오기·해제 | 공식 API 형태를 따른 모의 응답으로 검증 |

발송 서비스와 OAuth 앱이 미설정이면 앱에 ‘설정 대기’를 표시하고 실제 연결·발송이 성공했다고 표시하지 않는다. 테스트 수신함은 NODE_ENV=test에서만 사용할 수 있다.

## 서버와 도메인

Node.js 24, Docker/Compose가 있는 Linux 서버와 도메인을 준비한다. 도메인의 DNS를 서버로 연결하고 80/443 포트를 허용한다. 루트 `.env.example`을 `.env`로 복사해 실제 APP_DOMAIN을 설정한다. `.env`는 Git에 넣지 않는다.

```sh
docker compose config --quiet
docker compose up -d --build
```

app 컨테이너의 파일 시스템은 읽기 전용이고 SQLite와 백업은 각각 별도의 비공개 named volume에 저장한다. Caddy가 HTTPS를 종단하고 app:3000으로 전달한다. app 포트는 호스트에 공개하지 않는다. TRUST_PROXY=1은 이 구성에서만 활성화하며 Caddy가 전달한 마지막 유효 클라이언트 IP를 사용한다. 직접 실행할 때는 기본적으로 전달 헤더를 신뢰하지 않는다. PUBLIC_ORIGIN은 경로/후행 슬래시가 없는 정확한 HTTPS origin이어야 한다. 웹과 API는 같은 사이트에 제공한다.

운영 데이터 보존에는 `docker compose down -v`를 사용하지 않는다. 데이터 볼륨을 없애면 계정·암호화 키가 사라진다. 운영 확인은 `/api/health`, 로그인된 `/api/operations/backup`, 실제 로그인·Todo 저장·재조회로 한다. health의 200만으로 이메일/OAuth 연결을 보증하지 않는다.

### 사내 프록시 CA가 있는 빌드 환경

TLS 검증을 끄지 않는다. 환경 관리자가 제공한 공개 CA를 BuildKit secret으로 전달할 수 있다. 인증서와 비밀키를 혼동하지 말고 비밀키를 전달하지 않는다. 이 CA는 빌드에만 사용하며 결과 이미지에 포함하지 않는다.

```sh
BUILDX_CONFIG=/workspace/.cache/buildx docker build \
  --secret id=extra_ca,src=/usr/local/share/ca-certificates/environment-proxy-ca.crt \
  -t duckduck:cloud-test .
```

일반 호스팅에서는 추가 CA 없이 기본 `docker compose up --build`를 사용한다. 해당 프록시 뒤에서 운영 API 통신도 수행한다면 호스트가 제공하는 공개 CA를 읽기 전용으로 마운트하고 NODE_EXTRA_CA_CERTS로 신뢰를 추가한다. strict-ssl/TLS 검증이나 패키지 체크섬을 비활성화하지 않는다.

## 백업과 복원

Compose 기본값은 24시간마다 백업, 14일 보관이다. 로컬 백업 파일과 원본 DB는 같은 저장소에 두지 않는 구성을 권장하며 Compose는 별도 볼륨을 사용한다. 외부 보관소가 없으면 서버 자체 손실에 대한 원격 복구는 제공하지 않는다.

```sh
npm run backup
npm run backup -- --restore /secure/backups/duckduck-backup-TIMESTAMP-UUID.sqlite \
  --to /secure/new-data-directory --key-file /secure/original-token-key
```

복원 대상 디렉터리는 새로 만드는 경로여야 한다. 기존 서버나 기존 DB를 덮어쓰지 않는다. 백업의 체크섬, HMAC, SQLite 무결성, 원래 암호화 키를 확인한 뒤 복사한다. 원래 서버를 중지하고 복원본의 계정·Todo를 확인한 다음 DATA_DIR/볼륨을 전환한다.

암호화 키는 기본적으로 DATA_DIR/.token-key에 0600 권한으로 생성한다. INTEGRATION_TOKEN_KEY를 일반 호스팅의 비밀 저장소에서 주입할 수도 있다(32바이트의 base64). 이 값은 로컬 암호 연산에 쓰이므로 네트워크 프록시용 placeholder를 넣지 않는다. 키는 DB 백업에 포함되지 않는다. 별도 비밀 보관소에 원래 키를 안전하게 보존해야 재해 복구할 수 있다. 키를 바꾸거나 잃으면 연결 정보·서명 검증을 복원할 수 없으며, 코드는 잘못된 키로 기동하지 않는다.

백업 실패 시 기존 검증본을 보존한다. S3 업로드가 실패해도 로컬 복사본은 남고 실패 상태를 표시한다. 중단된 작업의 잠금은 10분 lease 만료 뒤 재시도할 수 있다. 원본이나 검증된 백업을 임의로 지우지 않는다.

### S3 외부 보관

BACKUP_S3_BUCKET, BACKUP_S3_REGION, 선택적으로 BACKUP_S3_PREFIX를 지정한다. 가능하면 서버 IAM role을 사용하고, 필요하면 일반 호스팅 비밀 저장소에 AWS 자격 증명을 넣는다. SigV4 서명용 자격 증명은 로컬에서 실제 값으로 사용하므로 프록시 placeholder를 넣지 않는다. 이 작업에서 버킷이나 IAM 계정을 만들지 않았다.

전용 bucket/prefix에 PutObject, ListBucket, DeleteObject 권한을 제한한다. 업로드는 SSE-S3와 SHA-256 체크섬을 사용한다. 보관 정리는 전용 prefix 아래 duckduck-backup 형식의 이전 파일만 대상으로 한다. 앱이 중지되어도 보관 정책이 적용되도록 버킷의 해당 prefix에 14일 만료 lifecycle도 설정하는 것이 좋다. 기존 버킷 전체 정책을 코드가 덮어쓰지는 않는다. 백업 속 원래 암호화 키의 별도 보관도 필요하다.

## 이메일

Resend 계정을 만들고 발신 도메인을 인증한다. MAIL_FROM(인증된 발신 주소), MAIL_API_KEY를 서버의 보안 설정에 넣는다. API 주소는 `https://api.resend.com/emails`로 고정한다. 키는 앱 번들이나 채팅에 넣지 않는다.

인증·재설정 요청은 암호화된 outbox에 기록하고 최대 5번 재시도한다. 공급자가 수락한 작업은 큐의 메시지 본문을 지운다. API의 202는 요청이 큐에 들어갔음을 의미하며 받은편지함 도착을 보장하지 않는다. 인증번호는 15분, 최대 5회 시도이며 재요청은 최소 1분, 계정별 시간당 최대 5회로 제한한다. 비밀번호 재설정은 계정 존재 여부를 응답으로 구분하지 않는다. 성공 시 모든 기존 세션을 폐기한다.

실제 이메일 발송은 키·발신 도메인을 설정하고 본인이 요청한 이메일로 전달을 확인한 뒤 활성화된 것으로 간주한다. 테스트 수신함 결과를 실제 발송 결과로 보고하지 않는다.

## OAuth 공통

연결은 이메일 인증된 계정에서 시작한다. state는 계정과 provider에 묶이고 10분/한 번만 유효하다. Google은 PKCE를 사용한다. 공급자 토큰은 서버에서 AES-256-GCM으로 암호화하고 앱에 반환하지 않는다. 상태 응답에는 연결 여부·승인한 기능·계정 표시만 담는다. 재연결 시 다른 계정의 자료를 혼동하지 않도록 연결별 자료 ID를 분리한다.

PUBLIC_ORIGIN을 실제 서비스 주소로 설정하고 각 콘솔에 아래 callback을 정확히 등록한다.

| 서비스 | callback | 서버 설정 |
|---|---|---|
| Google | https://app.example.com/api/integrations/google/callback | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| Slack | https://app.example.com/api/integrations/slack/callback | SLACK_CLIENT_ID, SLACK_CLIENT_SECRET |
| Notion | https://app.example.com/api/integrations/notion/callback | NOTION_CLIENT_ID와 NOTION_CLIENT_SECRET 또는 NOTION_BASIC_AUTH |

example.com은 예시이며 실제로 만든 주소가 아니다. 공개 client ID는 일반 설정에, 비밀은 보안 설정에 저장한다. proxy-backed 환경에서는 Notion의 base64(client-id:client-secret) 전체를 하나의 NOTION_BASIC_AUTH 비밀로 제공한다. 로컬에서 placeholder를 base64로 인코딩하지 않는다. 일반 Docker 호스팅에서는 raw NOTION_CLIENT_SECRET도 사용할 수 있다.

네이티브 callback은 `duckduck://integrations/complete`로 승인 결과만 전달한다. 토큰이나 세션을 URL에 넣지 않는다. 이 scheme을 등록한 iOS 개발 빌드/앱에서 확인해야 하며 Expo Go 화면 테스트와 실제 OAuth 실기기 확인은 구분한다. 웹에서는 새 창에서 승인한 뒤 연결 상태를 새로고침한다.

### Google

Google Cloud Console에서 Calendar API, Gmail API, Drive API와 웹 OAuth client를 만든다. 동의 화면 및 테스트 사용자를 설정한다. 요청하는 권한은 계정 표시를 위한 openid/email, 사용자가 선택한 calendar.readonly, gmail.readonly, drive.metadata.readonly다. Gmail 등의 권한은 공개 사용 전에 Google의 앱 심사/추가 요건이 있을 수 있다.

캘린더는 기본 캘린더의 오늘부터 30일, 메일은 최근 30일 받은편지함의 제목, Drive는 파일 메타데이터를 가져온다. ‘자료 더 보기’로 페이지를 이동한다. 사용자 선택으로만 Todo에 추가하며 중복 가져오기는 재추가하지 않는다. 메일 발송이나 원문/파일 수정 기능은 이 구현에 없다.

### Slack

Slack 앱의 bot OAuth scopes에 channels:read, channels:history, groups:read, groups:history와 redirect URL을 등록한다. 승인된 워크스페이스의 채널을 고른 뒤 메시지를 가져온다. private 채널과 history는 앱이 접근 가능한 채널만 가능하며 필요하면 사용자가 채널에 앱을 초대한다. 앱이 메시지를 보내거나 자동으로 채널에 참여하지 않는다.

### Notion

공개 integration을 만들고 read content capability와 redirect URL을 설정한다. 사용자가 승인·공유한 페이지를 검색하고 선택해서 가져온다. Notion API version은 2025-09-03이며 OAuth token/refresh/revoke 형태는 공식 SDK @notionhq/client 5.28.0에서도 확인했다.

## 알림

Todo 편집에서 예정일·알림 시간을 설정하고, 내정보에서 이 기기의 알림을 켠다. 권한 요청은 사용자가 켤 때만 한다. 로컬 알림은 기기별이며 서버 푸시나 APNs 계정이 필요하지 않다. 가까운 60개부터 예약한다. 완료/삭제/변경/로그아웃/계정 삭제 때 취소하거나 다시 예약한다. 앱을 다시 활성화하면 서버 Todo를 불러오고 예약을 조정한다. 다른 기기에서 바꾼 내용을 즉시 전달하는 원격 푸시는 이번 구현에 포함하지 않는다.

웹에서는 알림 시간을 저장하지만 OS 알림을 예약하지 않는다. 아이폰 실제 알림은 향후 실기기 확인 때 검증한다. 어댑터 테스트 통과나 iOS 번들 생성만으로 기기에서 울렸다고 주장하지 않는다.

## 계정 삭제와 운영 데이터

삭제는 현재 비밀번호와 명시적 확인을 요구한다. 현재 운영 DB의 계정·Todo·log·세션·인증 코드·연결 토큰·자료 캐시를 삭제하고, 외부 연결 해제를 시도한다. 공급자 해제가 실패하면 해당 서비스 설정에서도 접근 권한 해제를 확인해야 한다. 이미 전달된 이메일과 공급자 자신의 기록은 해당 서비스 정책을 따른다.

운영 백업의 예전 데이터는 설정한 보관 기간에 따라 정리된다. 재해 복구할 때는 가장 최근 백업과 계정 삭제 이력을 확인해야 하며 과거 백업을 복원하면 그 시점의 데이터로 돌아간다는 점을 고려한다.

## 검증 명령

```sh
npm run check
npm test
npm --prefix mobile run typecheck
npm --prefix mobile run export:web -- --max-workers 2
npm --prefix mobile run test:e2e
npm --prefix mobile run test:web-auth
npm --prefix mobile run export:ios -- --max-workers 2
APP_DOMAIN=fixture.example docker compose config --quiet
npm run build:container
npm run test:container
```

마지막 명령은 직접 만든 duckduck:cloud-test 이미지와 임시 컨테이너/볼륨만 사용하고 정리한다. 실제 운영 볼륨이나 외부 메일/OAuth 계정을 쓰지 않는다. 공개 HTTPS 도메인, 실제 메일 발송, 실제 OAuth 승인은 서비스 계정 준비 후 별도로 확인해야 한다.

기존 unassigned todos.json은 SQLite 백업에 자동 포함되지 않는다. 계정에 명시적으로 가져오기 전까지 원본 파일도 별도 보존한다. 직접 `npm start`로 실행할 때는 호스트가 환경 변수를 주입해야 하며 Compose가 .env를 자동으로 읽는 동작과 구분한다. NOTION_BASIC_AUTH에는 ‘Basic ’ 접두사를 제외한 base64 값만 설정한다.

### Google Tasks와 아이폰 미리 알림
Google Cloud 프로젝트에서 Tasks API를 활성화하고 OAuth 동의 화면에 `https://www.googleapis.com/auth/tasks.readonly` 범위를 등록한다. 덕의 Google 연결 화면에서 Google Tasks 읽기를 선택해 재승인한다. `www.googleapis.com` 엔드포인트를 사용하며 추가 클라이언트 시크릿은 필요하지 않다. 목록을 고른 뒤 미완료 할 일을 선택해 가져온다. 완료 기록 보기에서는 완료된 항목을 참고용으로 조회할 수 있지만 Todo로 가져올 수 없다. 덕에서 변경한 완료 상태는 Google로 전파하지 않는다.

아이폰 미리 알림은 `expo-calendar` 네이티브 모듈을 포함한 새 앱 빌드에서 검증해야 한다. 내정보에서 가져오기를 누를 때만 미리 알림 권한을 요청한다. iOS 권한은 읽기/쓰기 전체 접근이지만 현재 앱 구현은 목록·미완료 항목·완료 기록 읽기만 사용한다. 선택한 제목·예정일·항목 ID가 로그인한 덕 계정에 저장되며 계정별로 중복을 방지한다. 권한 거절/허용, 여러 목록, 예정일 없는 항목, 반복 항목, 완료 기록 조회/선택 불가, 재가져오기와 다른 기기의 ID 차이를 실기기에서 확인한다. 기기에서 앱의 미리 알림 권한을 끄면 추가 읽기를 막을 수 있고, 이미 가져온 덕 Todo는 유지된다. EventKit ID는 기기마다 달라질 수 있다.

Google Tasks API 호출은 테스트 응답으로, 미리 알림 가져오기 API는 격리된 테스트 계정으로 검증했다. 실제 Google 계정 접근과 iOS 권한/기기 읽기는 아직 검증하지 않았다.

완료 기록을 읽기 위해 추가 Google 쓰기 권한이나 별도 iOS 권한은 요청하지 않는다. Google Tasks 완료 조회는 기존 `tasks.readonly`를 사용한다. 완료 기록을 표시해도 Todo/log가 증가하지 않아야 하고, 보기 전환 시 기존 선택을 초기화해야 한다. Google의 완료·숨김 페이지 탐색, Apple의 `ReminderStatus.COMPLETED` 조회와 미완료 보기 복귀를 실제 계정/기기에서 검증해야 한다. AI 관련 기록 검색은 별도 구현이 남아 있다.

### 외부 Tasks 검색 검증
로그인한 사용자의 `GET /api/integrations/google/search?q=검색어`는 기존 Tasks 읽기 권한을 사용한다. 빈/120자 초과 검색어를 거절하고, 연결 누락은 명시적으로 안내한다. 검색은 사용자별 15분당 30회로 제한된다. 한 번의 검색은 최대 5개 목록의 두 상태 첫 페이지를 조회하므로 최대 11번의 공급자 요청을 사용한다. 반환 `partial`이 참이면 전체 검색 결과라고 해석하지 않는다. 연결 변경/해제 중 도착한 결과는 반환하지 않는다.

실제 Google 계정에서 권한 재승인, 큰 목록의 부분 검색 안내, 완료 기록 참고, 미완료 가져오기 및 원본 상태 변경 후 재검색을 확인해야 한다. 현재 자동 검증은 격리된 계정과 공급자 테스트 응답을 사용한다. `artifacts/mobile-external-search-fixture.png`는 테스트 응답으로 확인한 UI다.
