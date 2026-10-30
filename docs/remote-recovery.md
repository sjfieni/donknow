# Turso 원격 백업과 복구

이 기능은 무료 서버의 로컬 임시 파일에 의존하지 않는다. 백업에는 모든 계정의 민감한 DB 내용이 있으므로 **암호화된 파일만** 외부에 보관한다. 현재 앱의 작은 테스트 DB를 위한 도구이며 64MB 내보내기 제한이 있다. 큰 DB는 제공 업체 내보내기를 사용한다.

## 수동 백업

관리 환경에 `STORE_DRIVER=turso`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`과 **원래의** `INTEGRATION_KEY_SEED` 또는 `INTEGRATION_TOKEN_KEY`를 비밀 환경 변수로 주입한다. 키/시드/토큰을 채팅·GitHub 코드·셸 명령 인수에 넣지 않는다. 원래 키가 DB의 지문과 일치하지 않으면 백업을 거절한다.

```sh
npm ci
npm run backup:remote -- --out /안전한/경로/duckduck.duckbackup
```

일관된 읽기 트랜잭션으로 스키마와 데이터를 수집하고 압축한 다음 AES-256-GCM으로 암호화한다. 원본 DB에는 데이터를 쓰지 않는다. 파일은 기존 경로를 덮어쓰지 않는다. 파일 확장자는 Git과 Docker 컨텍스트에서 제외된다.

## GitHub에서 자동 실행

1. 저장소 Settings → Secrets and variables → Actions에 다음 Repository secrets를 등록한다.
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN` (백업에는 읽기 전용 토큰 권장)
   - Render에 보관된 원래 `INTEGRATION_KEY_SEED` 또는, 별도 키를 사용했다면 `INTEGRATION_TOKEN_KEY`
2. Repository variable `DUCKDUCK_BACKUP_ENABLED`를 `true`로 설정한다.
3. Actions → Encrypted remote database backup → Run workflow로 한 번 실행하고 성공 여부를 확인한다. 백업 생성 후 `Restore into an isolated local DB and verify integrity` 단계가 실제 파일을 임시 DB에 복원해 검사한다. 통과한 파일만 artifact로 보관한다.
4. 성공한 실행의 암호화 artifact를 다운로드해 보관한다. 스케줄은 매일 한국 시간 03:30, artifact 보관은 7일이다.

비밀 설정과 활성화 변수가 없으면 백업 작업은 활성화되지 않는다. 파일만 추가했다고 백업이 이미 운영 중이라고 말하지 않는다. GitHub Actions/아티팩트도 계정의 무료 한도가 있으므로 유료 사용 한도를 늘리지 않고 사용량을 확인한다. 백업 파일과 암호화 키/시드는 서로 분리해 안전하게 보관한다. 잃어버린 키는 복원할 수 없다.

## 새 DB로 복원

1. 새 빈 Turso DB를 만든다. 현재 운영 중인 DB를 삭제하거나 비우지 않는다.
2. 관리 환경의 DB URL/쓰기 토큰을 **새 DB** 것으로 설정하고, 암호화 키/시드는 원래 값을 유지한다.
3. 아래를 실행한다.

```sh
npm run backup:remote -- --restore /안전한/경로/duckduck.duckbackup
```

원본과 같은 호스트나 기존 테이블이 있는 대상은 거절한다. 원래 키로 인증/복호화한 뒤 트랜잭션으로 스키마와 데이터를 복원한다. 손상된 파일·다른 키·기존 DB 덮어쓰기는 거절한다.

복원은 데이터를 살리는 동작이다. 예전 세션, OAuth state, 인증 코드, 메일 전송 대기, 동기화 전송 대기열은 복원하지 않는다. 외부 토큰은 암호화 상태로 유지하되 완료 동기화는 꺼진 상태로 바꾼다. 모든 사용자가 다시 로그인하고 연결 점검/권한을 확인해야 한다. 백업 이후 탈퇴한 계정이 있다면 복구 데이터 처리도 검토한다.

4. 새 DB를 별도 테스트 서비스에 연결하고 로그인·Todo 수·완료 기록·내보내기를 검증한다.
5. 검증 후에만 Render의 DB URL/토큰을 새 DB로 바꾼다. 암호화 시드는 그대로 유지한다. 기존 DB는 검증이 끝날 때까지 보존한다.

이 저장소에서는 격리된 DB로 암호화·무결성·빈 DB 복원·자격 증명 재생 방지 검증을 수행했다. 실제 Turso 계정의 스케줄과 재난 복구 훈련은 비밀 설정과 실행 확인이 필요하다.

## 백업 파일의 자동 복원 검증

```sh
npm run backup:verify -- /안전한/경로/duckduck.duckbackup
```

원래 암호화 키/시드만 있으면 된다. 이 명령은 원격 DB URL·토큰을 사용하지 않고, 임시 폴더의 native libSQL DB로만 복원한다. 운영 DB에는 접속하지 않으며, 검사 종료 시 임시 DB를 삭제한다. 별도 서버·유료 DB·새 비밀 설정이 필요 없다.

검사 항목은 인증된 복호화, 스키마/데이터 복원, SQLite 무결성과 외래 키, Todo 형식, 외부 연결 토큰 복호화, 예전 세션/인증 코드/전송 대기 제거, 완료 동기화 비활성화다. 로그에는 계정·Todo·댓글·연결의 합계와 검사 결과만 출력하고 원문·주소·토큰은 출력하지 않는다. 앱 서버와 메일/동기화 워커를 실행하지 않는다.

매일 백업 작업에도 이 단계를 포함한다. GitHub Actions에서 해당 단계까지 초록색인지 확인해야 실제 운영 백업 파일의 복원 검증 완료로 기록한다. 개발 환경에서는 격리된 데이터의 정상 복원, 다른 키·변조 거절, 원본 DB 세션/전송 대기 유지까지 검증했다. 이 검사는 실제 Turso의 새 원격 DB 연결·운영 서버 전환을 시험하는 재난 복구 훈련과는 구분한다.
