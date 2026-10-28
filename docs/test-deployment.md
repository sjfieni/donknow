# 무료 테스트 서버 열기

기본 배포는 **Render Free 서버 + Turso 무료 DB** 구성입니다. 별도 도메인이나 유료 디스크를 요구하지 않습니다. 각 서비스의 무료 한도 안에서 사용하는 테스트용 구성입니다. 가입/배포 화면에서 Free를 선택하고, 유료 플랜·카드 등록·자동 유료 업그레이드를 선택하지 마세요. 서비스의 현재 무료 제공 조건은 가입 화면에서 확인합니다.

코드: https://github.com/sjfieni/donknow

## 1. Turso에 무료 DB 만들기

1. [Turso](https://turso.tech)에 로그인하고 무료 플랜에서 데이터베이스를 만듭니다.
2. DB의 연결 화면에서 **Database URL** (`libsql://…`)과 **Auth Token**을 확인합니다.
3. 두 값은 아래 Render 환경 설정에만 입력합니다. 토큰을 GitHub나 채팅에 붙여넣지 않습니다.

## 2. Render에 연결하기

[무료 배포 설정 열기](https://render.com/deploy?repo=https://github.com/sjfieni/donknow)

1. Render에 로그인하고 GitHub의 `sjfieni/donknow` 저장소 접근을 허용합니다.
2. `main` 브랜치의 최신 `render.yaml`을 사용합니다. 서버 플랜이 **Free**, 영구 디스크가 **없음**인지 확인합니다. Starter나 디스크 요금이 보이면 이전 설정이므로 페이지를 새로 열어 확인합니다.
3. 다음 두 값을 입력합니다.

| 항목 | 입력할 값 |
|---|---|
| `TURSO_DATABASE_URL` | Turso Database URL |
| `TURSO_AUTH_TOKEN` | Turso Auth Token |

암호화용 `INTEGRATION_KEY_SEED`는 Render가 자동 생성합니다. 재배포해도 이 값을 유지해야 합니다. DB 연결 정보나 암호화 키가 없으면 서버는 시작하지 않습니다. 데이터가 사라질 수 있는 임시 로컬 DB로 자동 전환하지 않습니다.

4. 배포가 완료되면 발급된 `https://…onrender.com` 주소를 엽니다. 그 주소가 앱과 API의 주소입니다.
5. 회원가입하고 테스트용 할 일을 추가합니다. 새로고침과 수동 재배포 후에도 계정과 할 일이 유지되는지 확인합니다.

## 저장과 무료 제한

- 계정, 할 일, 세션, 암호화한 연결 정보는 Turso DB에 저장합니다. Render의 `/tmp/duckduck`은 임시 작업 폴더이며 데이터베이스를 보관하지 않습니다.
- 무료 서버는 대기 후 첫 접속이 느릴 수 있습니다. DB 용량·읽기/쓰기·서버 이용 한도를 넘으면 서비스가 제한될 수 있으므로 제공 업체 대시보드의 사용량을 확인합니다. 무료 한도나 요금이 계속 동일하다고 보장하지 않습니다.
- 자동 유료 업그레이드를 설정하지 않습니다. 이 구성 파일에는 유료 서버·디스크·유료 DB 리소스가 없습니다.
- 로컬 SQLite 자동 백업은 이 무료 구성에서 꺼집니다. 원격 DB 보관과 별도 백업은 다릅니다. 필요한 경우 Turso의 무료 범위에서 내보내기를 하고, 자동 백업/시점 복원은 제공 플랜에 포함되는지 확인합니다.
- Render의 암호화 시드와 Turso 토큰은 안전한 곳에 보관합니다. 서비스나 DB를 삭제하기 전에는 데이터 내보내기와 키 보관을 먼저 진행합니다. 새 Render 서비스를 만들 때 기존 DB를 연결한다면 원래 시드도 옮겨야 합니다.
- 기존 유료 서버를 이미 만들었다면 GitHub 설정 변경만으로 해지되지 않습니다. 기존 데이터부터 보존하고 Render에서 해당 서비스의 상태와 요금을 따로 확인해야 합니다.

## 확인할 기능

- 계정 생성·로그인 → 할 일 추가 → 새로고침 → 수동 재배포 후 계정/할 일 유지
- 완료 → 약 4초 뒤 log 이동 → 미완료로 되돌리기
- 덕에서 초안 만들기 → Todo 추가 → 기록 찾기
- 내정보에서 `클라우드 DB 저장` 안내 확인

이메일·OAuth는 별도 설정 후 사용할 수 있습니다. AI 연결과 아이폰 배포는 포함하지 않습니다. 원격 DB 드라이버는 로컬 HTTP 프로토콜 테스트 서버를 통해 재시작/계정 분리/트랜잭션/암호화 키 보존을 검증했습니다. 실제 Render·Turso 계정 생성과 공개 서버 접속은 아직 수행하지 않았습니다. 자세한 설정은 [운영 안내](operations.md)를 참고하세요.

## 시작 명령 오류가 발생한 경우

`export PUBLIC_ORIGIN=...; exec node server.js: not found` / 종료 코드 127은 이전 Docker 시작 명령이 잘못 해석된 경우다. 최신 설정은 단순한 `node server.js`를 사용하고 서버가 `RENDER_EXTERNAL_URL`을 직접 읽는다. 기존 `PUBLIC_ORIGIN`을 직접 설정한 경우 그 값을 우선하며 HTTPS 주소 검증은 유지한다.

GitHub 업데이트 후 Render의 해당 Blueprint에서 **Manual sync**로 설정을 동기화한다. 서비스 설정의 Docker Command가 `node server.js`인지 확인하고, 배포가 시작되지 않으면 **Manual Deploy → Deploy latest commit**을 실행한다. Turso URL·토큰·기존 암호화 시드는 바꾸거나 지우지 않는다.
