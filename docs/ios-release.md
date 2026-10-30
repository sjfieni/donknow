# iPhone 첫 출시 준비

2026-10-30 사용자가 iPhone App Store 출시를 요청했다. AI 연결은 계속 보류한다.

## 현재 상태

- Expo 앱 버전 1.0.0, iPhone 전용, 초기 빌드 번호 1.
- Bundle ID 후보: `com.sjfieni.duckduck`. 저장소 소유 이름을 기준으로 한 설정값이며 Apple 등록·사용 가능 여부는 확인 전이다. 실제 개발자 계정에서 소유권을 확인한 후 최초 등록한다.
- EAS production: App Store 배포, 자동 빌드 번호 증가, 기존 HTTPS 서버를 기본 연결로 포함. 서버 키·비밀값은 앱에 넣지 않는다.
- production 빌드가 자동으로 심사 제출되거나 공개되지는 않는다.
- Expo 웹 프로젝트는 사용자가 생성했다: `thepmpo/duckduck-donknow`, Project ID `f7827732-1b41-485f-b3b2-6bcc145f3c44`. 사용자 제공 식별자를 `mobile/app.json`의 owner와 extra.eas.projectId에 반영했다. 원격 계정 접근 권한은 별도 확인이 필요하다.
- 이 클라우드에는 EAS CLI와 Expo/Apple 제출 인증이 없다. 아직 IPA 생성·서명·TestFlight 업로드·심사 제출을 하지 않았다.

## 계정 연결 후 실행

`mobile/`에서 Expo 계정으로 로그인하고 올바른 Apple 개발자 팀을 선택한다. 비밀번호·OTP·서명 파일을 채팅이나 Git에 넣지 않는다. Apple Developer Program 가입은 일반적으로 연 US$99(지역별 가격 상이)가 필요하다. EAS 무료 빌드 할당량·대기열을 확인하며 유료 업그레이드를 자동으로 진행하지 않는다.

```sh
npx eas-cli@latest login
npx eas-cli@latest init --id f7827732-1b41-485f-b3b2-6bcc145f3c44
npx eas-cli@latest build --platform ios --profile production
```

`eas init`으로 연결된 실제 프로젝트 ID·owner를 저장하고 빌드하기 전에 Bundle ID를 확인한다. 기존 팀이나 인증서가 있으면 재사용 여부를 확인하며 임의로 폐기하지 않는다. App Store Connect에 실제 앱 레코드를 만든 뒤 반환된 App Store 앱 ID를 `eas.json`의 `submit.production.ios.ascAppId`에 추가한다. Apple 팀 ID도 확인 후 필요한 위치에 설정한다. 임의 숫자/플레이스홀더 ID를 넣지 않는다.

```sh
npx eas-cli@latest submit --platform ios --profile production --id BUILD_ID
```

실제 성공한 빌드 ID를 지정한다. `--latest`로 다른 빌드를 잘못 제출하지 않는다. 업로드 후 TestFlight 실기기 확인을 먼저 수행하고 App Store Connect에서 심사를 제출한다. 심사 승인 후 공개 시점은 수동으로 관리한다.

## 심사 전 필요한 내용

- 공개 개인정보처리방침 URL, 지원 URL, 실제 지원 연락처와 운영 주체. 현재 `/project`는 개발 문서이며 개인정보처리방침을 대신하지 않는다.
- App Store용 아이콘과 실제 iPhone 스크린샷. 웹/모의 응답 이미지를 실기기 캡처로 표시하지 않는다. 현재 기본 리소스는 최종 브랜드 검토 전이다.
- App Privacy: 이메일/계정 식별자, 사용자 생성 할 일·공개 댓글, 사용자 승인 외부 자료의 수집·목적·사용자 연결 여부를 실제 동작에 맞게 신고한다. 추적/광고 기능은 현재 구현하지 않았다. 수집하지 않는 항목을 선언하지 않으며 실제 Apple 질문에 맞춰 확인한다.
- 암호화 수출 신고, 연령 등급, 콘텐츠 권리, 지원 지역, 앱 이름 사용 가능 여부를 실제 계정에서 확인한다.
- 이메일·비밀번호 로그인과 앱 내 계정 삭제를 제공한다. Google/Notion은 외부 자료 연결이며 앱 로그인으로 쓰지 않는다. 인증 방식을 바꾸면 Apple 로그인 관련 심사 요건을 다시 확인한다.
- 심사용 접근 계정은 별도로 만들고 실제 개인 자료·토큰이 없는 계정을 사용한다. 계정 정보는 App Store Connect 심사 메모의 전용 보안 입력란에만 넣는다.
- AI 미연결 상태를 숨기거나 AI 대화가 동작한다고 소개하지 않는다. Slack 보류 기능도 동작하는 기능처럼 홍보하지 않는다.
- Google OAuth 테스트 모드/테스트 사용자 제한은 일반 사용자 출시와 다르다. 일반 사용자 권한 승인 가능 여부와 민감 범위 검증을 확인하고, 준비가 안 된 연결은 최초 공개 범위에서 제외할지 결정한다. Notion도 다른 사용자 계정 승인을 확인한다.
- Render 무료 서버 휴면 후 첫 응답 지연과 무료 한도는 유지된다. 빌드가 된 것만으로 운영 안정성이 검증됐다고 판단하지 않는다.

## TestFlight 실기기 확인

가입·이메일 인증·재로그인·삭제, Todo 스와이프/4초 되돌리기/log, 전체 캘린더, 앱 재실행, 네트워크 끊김/복구를 확인한다. Google/Notion OAuth 승인 후 `duckduck://` 복귀, 완료 동기화, 미리 알림 거절/허용/가져오기/수동 상태 반영, 기기 알림 및 완료/로그아웃 후 예약 취소, JSON·카카오 공유도 확인한다. 타 계정 로그인 시 이전 데이터가 사라지는지 확인한다.

JavaScript iOS export는 호환성 검증이며 서명 IPA·실기기 검증을 대신하지 않는다.

Expo에서 GitHub 저장소를 연결하는 경우 저장소는 `sjfieni/donknow`, 앱 루트는 `mobile`, 브랜치는 `main`이다. 프로젝트 ID 설정만으로 GitHub 연결·서명 인증·빌드 실행이 완료된 것으로 기록하지 않는다.
