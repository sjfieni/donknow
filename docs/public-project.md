# 공개 프로젝트 문서와 댓글

배포 후 주소: https://duckduck-test.onrender.com/project

본문·이미지 35개가 HTML 안에 들어 있어 파일 업로드나 Notion 연결 없이 읽는다. 덕 앱과 같은 무료 Render/Turso를 사용한다. 새 외부 댓글 서비스를 가입하거나 결제하지 않는다.

## 사용

1. 문서를 열고 하단 댓글 영역을 사용한다. 각 절과 이미지의 수정 요청 버튼으로 위치를 지정할 수 있다.
2. 기존 덕 계정으로 로그인한다. 이메일 인증을 마친 계정만 작성한다.
3. 공개 표시 이름과 수정 내용을 입력한다. 계정 이메일을 자동으로 공개하지 않는다.
4. 자기 댓글은 수정·삭제·반영 확인·다시 열기가 가능하다. 다른 사용자의 댓글은 변경할 수 없다.
5. 댓글을 남기고 AI에게 페이지 주소와 댓글 위치를 알린다. 자동 감시/자동 수정은 하지 않는다.
6. AI의 네트워크가 제한되면 ‘AI에 전달할 댓글 복사’로 내용을 대화에 붙여넣는다. 복사는 첫 50개 열린 요청이며 더 있으면 다음 페이지 안내를 표시한다.

문서와 댓글은 링크를 가진 사람에게 공개된다. 비밀번호·API 키·개인정보는 적지 않는다. 댓글은 DB에 저장되어 재시작해도 유지되며 계정 삭제 시 본인 댓글도 삭제된다. 개인 JSON 내보내기에 본인 댓글도 포함한다.

## API와 검증

- `GET /api/project/comments?status=open` 공개 읽기, 50개 페이지와 cursor
- `GET /api/project/comments/:id` 공개 단일 댓글 읽기
- `POST /api/project/comments` 인증+이메일 확인, 사용자별 작성 제한
- `PATCH/DELETE /api/project/comments/:id` 소유자와 version 검사

공개 응답에는 계정 이메일·사용자 ID·비밀값을 넣지 않는다. 본문·인용·이름은 textContent로 렌더링한다. 스크립트 삽입, 다른 사용자 수정, 오래된 버전 덮어쓰기를 막는 테스트가 있다. 문서는 자체 스크립트와 인라인 이미지에 제한한 CSP로 제공한다.

문서 재생성: `python scripts/build-handoff.py`. API/브라우저 검증: `node --test test/project-comments.test.js`, `npm --prefix mobile run test:project`.

Render 자동 배포는 꺼져 있다. 최신 코드 저장 후 서비스의 **Manual Deploy → Deploy latest commit**을 실행해야 공개 페이지가 생긴다. Live 상태는 실제 대시보드/응답으로 확인한다.

### 문서 로딩과 목차

온라인 HTML은 이미지를 별도 해시 파일(`/project-assets/`)로 분리하고 지연 로딩합니다. 이미지 캐시는 1년이며 내용이 바뀌면 주소가 바뀝니다. 오프라인 HTML은 기존처럼 이미지를 포함합니다. 넓은 화면에는 왼쪽 고정 목차, 작은 화면에는 상단 목차를 제공합니다. 무료 Render의 휴면 후 첫 요청 지연은 남습니다.
