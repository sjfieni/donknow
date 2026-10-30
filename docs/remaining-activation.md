# 남은 연결 활성화와 운영 확인

기준: 2026-10-29, 무료 Render + Turso. AI 연결과 아이폰 배포는 보류한다.

## 확인 상태

### iPhone 출시 요청 — 최신 변경

사용자가 2026-10-30 App Store 출시를 명시적으로 요청했다. iPhone 배포 보류를 해제하고 빌드·서명·스토어 제출 준비를 진행한다. Apple 개발자 계정만 보유한다고 응답했으며 Expo 계정 연결은 필요하다. 앱 1.0.0·EAS 빌드 설정과 기존 API 기본 주소를 준비하고 TypeScript/iOS JS export를 검증했다. 서명 IPA·TestFlight·실기기·심사 제출은 아직 완료되지 않았다. AI·Slack과 범용 붙여넣기 자동 추출은 보류 유지한다. 세부 항목은 [출시 안내](ios-release.md)를 따른다.

### 최신 사용자 확인 (2026-10-30)

- Google 캘린더·메일·Drive 기본 조회, Notion 연결·페이지 조회·Todo 가져오기 확인.
- Google Tasks 완료 동기화 활성화와 완료/미완료 복원 전송을 모두 확인.
- 백업 실행 [40991528894](https://github.com/sjfieni/donknow/actions/runs/40991528894) 성공을 사용자 확인.
- 복원 검증 포함 실행 [40996926840](https://github.com/sjfieni/donknow/actions/runs/40996926840) 전체 녹색을 사용자 확인. 실제 암호화 백업의 임시 로컬 DB 복원·무결성·외부 효과 비활성화 검사까지 완료. 운영 원격 DB 전환 훈련과는 구분한다.
- 남은 운영 확인: GitHub `schedule` 이벤트로 실행된 정기 백업 결과. 에이전트 API 조회는 Forbidden으로 접근하지 못했으므로 성공을 추정하지 않는다.
- 보류 유지: Slack, AI 연결, iPhone 배포·실기기 검증, 범용 붙여넣기 자동 할 일 추출 백로그.

아래 초기 상태와 날짜별 기록은 당시의 상태다. 최신 상태는 위 확인을 우선한다.


- 사용자가 실제 서비스에서 확인: 가입/저장, 이메일 인증, Google Tasks 미완료 가져오기, 완료 기록 참고용 조회, 덕의 외부 완료 기록 검색.
- 이번에 구현/자동 검증: Google Tasks 완료 동기화 선택·전송 대기열·충돌 처리·상태 가져오기, 월별 Google 캘린더 조회, 서비스 연결 점검, 개인 JSON 내보내기, 원격 DB 암호화 백업·새 DB 복원, 아이폰 미리 알림 상태 반영 어댑터.
- 실제 계정에서 추가 확인할 것: Google 수정 권한 승인, 캘린더/Gmail/Drive 추가 승인, Slack/Notion OAuth 앱 등록·승인, GitHub 백업 비밀 설정 및 실행.
- 실제 아이폰에서 확인할 것: EventKit 권한과 상태 맞추기, 기기 알림, JSON 파일 공유. 번들 생성은 실기기 검증과 다르다.

## 1. Google의 다른 기능

[프로젝트 duckduck-513102](https://console.cloud.google.com/apis/library?project=duckduck-513102&authuser=1)에서 Google Calendar API, Gmail API, Google Drive API를 각각 활성화한다. 기존 웹 OAuth 클라이언트와 콜백은 유지한다.

OAuth 데이터 액세스에 필요한 범위만 추가한다.

- 캘린더: `https://www.googleapis.com/auth/calendar.readonly`
- 메일: `https://www.googleapis.com/auth/gmail.readonly`
- 드라이브: `https://www.googleapis.com/auth/drive.metadata.readonly`

덕의 내정보 → Google에서 원하는 범위를 선택하고 권한을 다시 승인한다. 캘린더는 조회 중인 달의 기본 캘린더 일정과 다음 페이지를 보여준다. 일정 시각은 한국 날짜 기준이다. 메일은 최근 30일 받은편지함의 제목, Drive는 파일 이름/메타데이터를 가져온다. 메일 본문·첨부/파일 본문 전체를 읽거나 전송하지 않는다. Gmail의 공개 배포/민감 범위 심사는 개인 테스트 완료와 별개다.

## 2. Google Tasks 완료 동기화

기존 `tasks.readonly` 연결은 그대로 읽기 전용이다. 원본 변경은 자동으로 켜지지 않는다.

1. Google 동의 범위에 `https://www.googleapis.com/auth/tasks`를 추가한다. 이 범위는 생성/수정/삭제를 포함하지만 현재 덕은 완료 여부만 변경한다.
2. 덕에서 `Google Tasks 수정 권한`을 선택하고 다시 승인한다.
3. 연결 화면의 `완료 동기화 켜기`를 직접 누른다. 과거 로컬 변경을 자동으로 원본에 밀어 넣지 않는다. 이후 완료/되돌리기 변경부터 전송 대기열에 들어간다.
4. 변경 후 약 4초 대기를 거쳐 전송하며 일시 오류를 재시도한다. 무료 서버가 쉬거나 재시작되면 지연될 수 있다. 대기열은 DB에 보존한다.
5. 동기화 상태 새로고침에서 대기/실패/충돌을 확인한다. 실패는 재시도할 수 있다.
6. Google에서 바꾼 완료 상태는 `Google 완료 상태 다시 읽기`로 가져온 항목만 5개씩 확인한다. 충돌한 항목은 이 동작으로 원본 상태에 맞춘다. 새 완료 기록을 Todo로 생성하지 않는다.

원본 ETag를 확인하고 `If-Match`로 변경한다. 충돌 시 덮어쓰기를 멈춘다. 제목·날짜·삭제는 동기화하지 않는다. 끄기/연결 해제는 대기열을 취소하지만 이미 전송된 요청을 되돌리지는 않는다.

## 3. Slack

[Slack 앱 만들기](https://api.slack.com/apps)에서 OAuth 앱을 만든다. redirect URL:

`https://duckduck-test.onrender.com/api/integrations/slack/callback`

Bot scopes: `channels:read`, `channels:history`, `groups:read`, `groups:history`. Render 환경에 `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` 값을 등록하고 재배포한다. 덕에서 Slack 연결을 승인하고, 연결 점검 → 채널 → 메시지 → 선택 가져오기를 확인한다. 비공개 채널 등은 앱이 접근 가능한 범위만 읽으며 필요하면 사용자가 채널에 앱을 초대한다. 메시지를 보내지 않는다.

## 4. Notion (제품 안의 읽기 연결)

[Notion integrations](https://www.notion.so/profile/integrations)에서 OAuth 가능한 공개 integration을 등록하고 읽기 권한을 설정한다. redirect URL:

`https://duckduck-test.onrender.com/api/integrations/notion/callback`

Render에 `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`를 등록한다. 덕에서 연결할 워크스페이스와 페이지를 승인하고 연결 점검 → 페이지 선택 → Todo 가져오기를 확인한다. 내부 integration 토큰을 클라이언트 보안 비밀 대신 넣지 않는다. 이 기능은 승인한 페이지 읽기/가져오기용이며 대화 에이전트에게 Notion 페이지 작성 권한을 제공하지 않는다.

제품의 Notion 연결과 개발 문서를 정리할 Notion 페이지는 별개다. 문서 대상 계정·워크스페이스는 실제 연결을 통해 확인해야 한다.

## 5. 아이폰 기기 확인

새 네이티브 모듈을 포함한 개발 빌드가 있는 실제 아이폰에서만 확인한다. 배포는 이번 범위가 아니다.

- 미리 알림 권한 거절 → 설정에서 허용 → 목록 재조회
- 날짜 없음/반복/완료 항목/다른 목록/다른 기기 ID 확인
- 미완료만 가져오기, 완료 기록은 참고만 하기
- `아이폰 완료 상태를 덕에 반영`, `덕의 완료 상태를 아이폰에 반영` 후 원본 변경 확인. 원본 변경에는 별도 확인 버튼이 있다. 5개씩 직접 실행하며 자동 백그라운드 동기화가 아니다.
- 알림 권한 거절/허용, 미래 시간, 잠금 화면, 완료·삭제·로그아웃 후 예약 취소, 앱 재실행 후 중복 없음
- 내 데이터 파일 공유에서 JSON 파일 저장 확인. 임시 공유 파일은 공유 종료 후 삭제한다.

## 6. 본인 데이터 내보내기

내정보의 `내 데이터 파일 다운로드`는 로그인한 사용자의 계정 표시 정보와 Todo/완료 기록만 JSON으로 제공한다. 비밀번호 해시·세션·외부 토큰은 포함하지 않는다. 이 파일은 개인 데이터 보관용이며 전체 DB 재난 복구 백업과 다르다. 웹은 다운로드, 네이티브는 파일 공유를 사용한다.

## 7. 원격 DB 백업·복구

[원격 백업 안내](remote-recovery.md)를 따른다. GitHub 비밀 설정이 필요하며 기본값은 비활성화다. 파일은 인증된 AES-256-GCM으로 암호화된다. 복원은 다른 빈 DB에만 허용한다. 세션/인증 코드/전송 대기열은 복원 후 제거하고 완료 동기화를 끈다.

## 2026-10-30 실제 확인 및 동기화 화면 보완

- 사용자 확인: Google 캘린더·메일·Drive 기본 동작, Notion 연결·페이지 조회·Todo 가져오기.
- 사용자 확인: GitHub 백업 비밀 설정·활성화 변수 등록 후 첫 수동 실행 성공 (Actions run 40991528894). 매일 한국 시간 03:30 예약이며 정기 실행 결과와 실제 복원 훈련은 별도 확인한다.
- Google Tasks 완료 동기화는 실제 확인 중이다. 연결 상태 새로고침 시 동기화 권한도 다시 조회하도록 수정하고, 권한이 없으면 패널에서 수정 권한 승인을 바로 시작할 수 있게 했다. 승인 전에는 활성화할 수 없으며, 승인 후에도 완료 동기화 켜기는 사용자가 별도로 누른다.

## 2026-10-30 완료 동기화 확인과 백업 복원 검증 준비

- 사용자 확인: Google Tasks 완료 동기화 켜기, 덕에서 완료 시 Google 반영, log에서 미완료 복원 시 Google 반영까지 성공.
- 자동 백업에 실제 암호화 파일을 임시 로컬 DB로 복원하는 검증 단계를 추가했다. 격리된 테스트는 통과했으며, 변경 후 GitHub Actions 실행 결과는 아직 확인 전이다.
- 이 검증에는 새 Turso DB나 Render 운영 설정 변경이 필요 없다. 원격 DB에서 운영 서비스를 복구하는 전환 훈련은 별도 작업으로 남긴다.
