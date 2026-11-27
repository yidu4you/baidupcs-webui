# Changelog

이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [0.0.1] - 2026-11-27

첫 공개 버전.

### 추가
- BaiduPCS-Go v4.0.2 를 감싸는 웹 UI (FastAPI + 프레임워크 없는 SPA)
- 내 넷디스크: 목록·정렬·검색·트리·정보, 새 폴더·이름 바꾸기·복사·이동·삭제, 직링크, 공유 만들기, 와일드카드 다운로드
- 전송 현황: 파일별 진행률·속도·남은 시간, 중지·이어받기·재시도, 실시간 로그, 재시작 후에도 기록 유지
- NAS 파일: 다운로드/업로드 폴더 탐색, 브라우저에서 파일·폴더 업로드, 넷디스크로 업로드
- 공유 링크 저장(转存): 공유 문구에서 링크·추출 코드 자동 인식, 여러 링크 한 번에, 저장 후 바로 다운로드
- 오프라인 다운로드, 내 공유, 휴지통 관리
- 대화형 터미널(PTY + WebSocket)과 단일 명령 실행, 명령어 모음
- `config set` 전체 항목 설정 화면과 일반 회원/SVIP 권장 프리셋
- 계정: Cookies / BDUSS+STOKEN 로그인, 입력값 자동 정리, 로그인 후 넷디스크 접속 확인,
  티에바(贴吧) BDUSS 검증 실패 시 원인 안내와 검증 건너뛰기, 계정 전환
- 웹 UI 비밀번호 인증, PUID/PGID 실행, Synology DSM 컨테이너 매니저용 docker-compose

[0.0.1]: https://github.com/yidu4you/baidupcs-webui/releases/tag/v0.0.1
