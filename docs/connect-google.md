# 현재 테스트 서버에서 이메일 인증과 Google Tasks 연결하기

앱: https://duckduck-test.onrender.com

사용자가 기본 접속과 저장 동작을 확인한 테스트 서버를 대상으로 한다. AI 연결과 아이폰 배포는 계속 보류한다. 이 안내만으로 외부 계정/메일/OAuth가 활성화되지는 않는다.

## 1. 내 계정 이메일 인증 준비

현재 메일 어댑터는 Resend를 사용한다. 먼저 [Resend](https://resend.com)에 무료 계정을 만든다. 무료 플랜 제공 조건과 한도는 가입 화면에서 확인하며, 유료 업그레이드는 선택하지 않는다.

개인 테스트 단계에서는 Resend의 기본 테스트 발신자 `onboarding@resend.dev`를 사용할 수 있다. 이 발신자는 **Resend 가입 계정의 이메일 주소로만** 테스트 메일을 보낼 수 있다. 따라서 덕에서 인증할 계정의 이메일과 Resend 계정 이메일을 같게 해야 한다. 다른 사용자의 이메일로 보내려면 추후 소유 도메인을 등록하고 검증해야 한다.

[Resend API Keys](https://resend.com/api-keys)에서 메일 발송용 키를 만든 뒤, [Render 환경 설정](https://dashboard.render.com/web/srv-dbgpc0ff3r2c73abc7e0/env)에 다음 두 값을 등록한다.

| Render 변수 이름 | 값 |
|---|---|
| `MAIL_API_KEY` | Resend에서 생성한 API 키 값만 |
| `MAIL_FROM` | `onboarding@resend.dev` |

키는 채팅이나 GitHub에 보내지 않는다. `Bearer`, 변수 이름, 따옴표를 붙이지 않는다. 기존 Turso URL·토큰·암호화 시드를 유지한다. 환경 설정을 저장하고 재배포한다.

앱에서 내정보 → 이메일 인증 → 인증번호 요청 → 받은 메일의 6자리 번호 입력 순서로 확인한다. 메일 요청이 접수됐다는 안내는 실제 수신 완료와 다르므로 수신함/스팸함 및 Resend 발송 상태도 확인한다.

## 2. Google Tasks 앱 등록

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만든다. 개인 Tasks 연결에 결제 계정이나 유료 API를 추가하지 않는다.
2. [Tasks API 설정](https://console.cloud.google.com/apis/library/tasks.googleapis.com)에서 현재 프로젝트의 Google Tasks API를 활성화한다.
3. Google Auth Platform/OAuth 동의 화면에서 외부 사용(External), 테스트 상태(Testing)로 설정하고 실제 연결할 Google 이메일을 테스트 사용자로 등록한다. 앱 이름은 `duckduck`으로 설정한다.
4. OAuth 클라이언트를 **웹 애플리케이션** 유형으로 생성한다.
5. 승인된 JavaScript 원본과 리디렉션 URI를 아래와 같이 등록한다. 리디렉션 URI의 경로와 끝 슬래시 유무를 정확히 맞춘다.

| 항목 | 값 |
|---|---|
| 승인된 JavaScript 원본 | `https://duckduck-test.onrender.com` |
| 승인된 리디렉션 URI | `https://duckduck-test.onrender.com/api/integrations/google/callback` |

6. OAuth 데이터 액세스/범위 설정에 `openid`, 이메일 식별 범위, `https://www.googleapis.com/auth/tasks.readonly`를 추가한다. 처음에는 Tasks만 연결한다. Gmail·Drive·Calendar는 나중에 각각 API와 동의 범위를 추가한다.
7. 발급받은 정보를 Render 환경 설정에 등록한다.

| Render 변수 이름 | 값 |
|---|---|
| `GOOGLE_CLIENT_ID` | 웹 OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 클라이언트 보안 비밀 값만 |

클라이언트 보안 비밀도 채팅/GitHub에 보내지 않는다. 저장 후 재배포한다. Testing 상태의 OAuth 토큰은 Google의 테스트 앱 정책에 따라 재승인이 필요할 수 있다.

## 3. 실제 연결 확인

1. 덕에서 이메일 인증을 마친 계정으로 로그인한다.
2. 내정보 → Google 연결 안내 → **Google Tasks 읽기**만 선택한다. 기본으로 선택된 캘린더 읽기는 처음에는 해제한다.
3. Google 연결 → 등록한 테스트 Google 계정으로 승인한다. 팝업을 허용하고 완료 후 덕으로 돌아와 연결 상태를 새로고침한다.
4. Tasks 목록에서 미완료 항목을 한 개 가져오고, 재시도해도 중복되지 않는지 확인한다.
5. 완료 기록 보기에서는 참고용 기록만 표시되고 Todo로 가져오는 버튼이 없는지 확인한다.
6. 덕의 기록 찾기에서 같은 제목을 검색한다. 필요하면 Google Tasks에서 찾기를 실행한다.

기본 읽기 연결에서는 덕에서 바꾼 상태를 Google 원본으로 전파하지 않는다. 별도 수정 권한을 승인하고 완료 동기화를 켠 경우에만 이후 완료 변경을 반영한다. 연결 해제 후에도 이미 가져온 Todo는 남는다.

## 문제가 생기면

- 메일이 안 옴: Resend 발신자 제한, 가입 이메일 일치, API 키, 발송 실패 상태를 확인한다.
- Google 연결이 설정 대기: 두 Google 환경 변수 저장 후 최신 재배포 여부를 확인한다.
- redirect_uri_mismatch: 위 리디렉션 URI를 Google의 승인된 URI와 비교한다.
- access_denied 또는 테스트 제한: 연결할 계정을 테스트 사용자로 등록했는지 확인한다.
- insufficient permissions/API 비활성: Tasks API와 Tasks 읽기 범위를 확인하고 연결 권한을 다시 선택한다.

공유할 화면이나 로그에는 API 키, 토큰, OAuth 코드, 클라이언트 보안 비밀을 포함하지 않는다.

다른 서비스, 선택적 완료 동기화, 실제 기기 확인, 백업 활성화는 [남은 연결·운영 안내](remaining-activation.md)를 따른다.
