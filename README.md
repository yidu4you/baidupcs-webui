# baidupcs-webui

[![CI](https://github.com/yidu4you/baidupcs-webui/actions/workflows/ci.yml/badge.svg)](https://github.com/yidu4you/baidupcs-webui/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/yidu4you/baidupcs-webui)](https://github.com/yidu4you/baidupcs-webui/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[BaiduPCS-Go](https://github.com/qjfoidnh/BaiduPCS-Go)(百度网盘 명령줄 클라이언트)를 웹 브라우저에서 쓰는 웹 UI 입니다.
Synology DSM 컨테이너 매니저에서 docker compose 로 바로 실행할 수 있게 만들었습니다.

- 버전: **0.0.1** (BaiduPCS-Go v4.0.2 기준)
- 접속 주소: `http://NAS-IP:8777`
- 기본 다운로드 위치: NAS `/volume2/media/downloads` ↔ 컨테이너 `/downloads`

> 비공식 도구입니다. Baidu 및 BaiduPCS-Go 원 저작자와 관련이 없습니다. 바이두 이용 약관을 지켜 개인 용도로 사용하세요.

## 기능

| 화면 | 기능 (BaiduPCS-Go 명령) |
|---|---|
| 내 넷디스크 | 목록·정렬(`ls`), 트리(`tree`), 정보(`meta`), 검색(`search`), 새 폴더(`mkdir`), 이름 바꾸기·이동(`mv`), 복사(`cp`), 삭제(`rm`), 직링크(`locate`), 공유 만들기(`share set`), 와일드카드 다운로드(`match` + `download`) |
| 전송 현황 | 다운로드/업로드 진행률·속도·남은 시간, 파일별 상태, 중지·이어받기·재시도, 실시간 로그. 컨테이너를 다시 켜도 기록이 남습니다 |
| NAS 파일 | 다운로드/업로드 폴더 탐색, PC → NAS 파일·폴더 끌어다 올리기, NAS → 넷디스크 업로드(`upload`), PC 로 받기, 삭제 |
| 공유 링크 저장 | 공유 문구를 그대로 붙여넣으면 링크와 추출 코드 자동 인식(`链接… 提取码…`, `?pwd=`), 여러 개 한꺼번에, 저장 후 바로 다운로드(`transfer --download`) |
| 오프라인 다운로드 | http/https/ftp/magnet/ed2k 추가, 목록·조회·취소·기록 삭제(`offlinedl`) |
| 내 공유 | 공유 목록, 링크+추출 코드 복사, 공유 취소(`share list/cancel`) |
| 휴지통 | 목록, 되살리기, 영구 삭제, 비우기(`recycle`) |
| 터미널 | BaiduPCS-Go 대화형 모드 그대로 (Tab 자동완성, 대화식 `login`, `su` 등 **모든 명령**), 명령 한 번 실행, 명령어 모음 |
| 설정 | `config set` 의 모든 항목 + `no_check`. 일반 회원/SVIP 권장값 프리셋 |
| 계정 | Cookies 로그인(권장), BDUSS+STOKEN 로그인, 여러 계정 전환(`su`), 로그아웃, accessToken, 용량(`quota`) |

## 설치 (Synology DSM)

### 1. 소스 받기

다음 중 하나를 고르세요.

- **릴리즈 zip (권장)**: [Releases](https://github.com/yidu4you/baidupcs-webui/releases) 에서 `baidupcs-webui-0.0.1-dsm.zip` 을 받습니다.
  BaiduPCS-Go 바이너리가 들어 있어 빌드할 때 GitHub 접속이 필요 없습니다.
- **git clone**: SSH 로 NAS 에 접속해서
  ```sh
  cd /volume1/docker
  git clone https://github.com/yidu4you/baidupcs-webui.git
  ```
  (빌드할 때 BaiduPCS-Go 를 GitHub 릴리즈에서 내려받습니다.)

NAS 의 `/volume1/docker/baidupcs-webui` 같은 폴더에 두면 됩니다.

### 2. docker-compose.yml 확인

| 항목 | 설명 |
|---|---|
| `WEB_PASSWORD` | 웹 UI 비밀번호. **반드시 바꾸세요.** 예시 값 그대로면 컨테이너 로그에 경고가 나옵니다 |
| `PUID` / `PGID` | 다운로드한 파일의 소유자. SSH 에서 `id 내계정` 으로 확인 (DSM 첫 관리자 계정은 보통 1026 / 100) |
| `volumes` | 다운로드 `/volume2/media/downloads`, 업로드 `/volume2/media/downloads/_upload` 가 기본값입니다. 원하는 폴더로 바꾸세요 |

### 3. 컨테이너 매니저에서 실행

**컨테이너 매니저 → 프로젝트 → 생성**
- 프로젝트 이름: `baidupcs-webui`
- 경로: 1번 폴더
- 소스: “기존 docker-compose.yml 사용”
- 웹 포털 설정은 건너뛰고 **완료** → 이미지 빌드 후 자동 실행 (처음 몇 분 걸림)

브라우저에서 `http://NAS-IP:8777` → 비밀번호 입력 → **계정** 화면에서 바이두 로그인.

> DSM 방화벽을 쓴다면 8777 포트를 허용하세요.

### 빌드 없이 이미지로 실행 (선택)

태그를 올리면 GitHub Actions 가 `ghcr.io/yidu4you/baidupcs-webui` 에 amd64/arm64 이미지를 올립니다.
`docker-compose.yml` 의 `build:` 블록을 지우고 `image: ghcr.io/yidu4you/baidupcs-webui:0.0.1` 로 바꾸면 빌드 없이 받아서 실행합니다.
(GitHub 의 Packages 설정에서 이미지를 Public 으로 바꿔야 로그인 없이 받을 수 있습니다.)

## 바이두 로그인

**Cookies 로그인 (권장)**
1. PC 브라우저에서 `pan.baidu.com` 에 로그인
2. F12 → Network 탭 → 새로고침 → 아무 요청 선택 → Request Headers 의 `Cookie` 값 전체 복사
3. 계정 화면의 Cookies 칸에 붙여넣기 → BDUSS / STOKEN 이 들어 있는지 바로 표시됩니다

**BDUSS + STOKEN**: F12 → Application → Cookies → `https://pan.baidu.com` 에서 복사합니다.
STOKEN 은 꼭 pan.baidu.com 쿠키에서 가져와야 합니다 (`bdstoken` 과 다름). 공유 링크 저장(转存)에 필요합니다.

**아이디/비밀번호** 로그인은 원 프로젝트에서 유지보수가 중단되어 터미널 화면의 대화형 `login` 으로만 가능합니다.

> 복사한 뒤 브라우저에서 **로그아웃하면 그 BDUSS 는 바로 무효**가 됩니다. 탭만 닫으세요.

### `检测BDUSS有效性错误代码: 1` 오류

BaiduPCS-Go 는 로그인할 때 티에바(贴吧) 서버로 BDUSS 를 확인합니다. 이 오류가 나면

1. 먼저 값을 잘못 넣지 않았는지 확인하세요 (만료, 일부만 복사, `BDUSS_BFESS` 를 복사 등).
2. 값이 맞는데도 실패하면 화면에 나오는 **검증 건너뛰고 로그인** 을 누르세요. 바로 넷디스크 접속으로 실제 유효한지 확인하고, 실패하면 등록을 자동으로 취소합니다.
   이 방식으로 등록한 계정은 uid 가 24 로 고정되어 한 개만 등록됩니다.

## 다운로드 속도 (원 README 권장)

- 일반 회원: `max_parallel = 1`, `max_download_load = 1`. 늘리면 잠깐 빨라졌다가 몇 시간~며칠 속도 제한에 걸릴 수 있습니다.
- SVIP: `max_parallel` 10 이상(20 이하), `max_download_load` 1~2.
- 설정 화면의 **일반 회원 권장 / SVIP 권장** 버튼으로 채울 수 있습니다.
- 중지했다가 **이어받기** 를 누르면 받던 곳부터 이어집니다. 업로드는 이어올리기를 지원하지 않습니다.

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `WEB_PORT` | `8777` | 웹 포트 (`ports` 와 함께 바꾸세요) |
| `WEB_PASSWORD` | (없음) | 웹 UI 비밀번호. 비우면 인증 없이 열림 |
| `SESSION_DAYS` | `30` | 로그인 유지 기간(일) |
| `PUID` / `PGID` | `0` | 실행 사용자 (compose 예시는 1026/100) |
| `UMASK` | `022` | 새 파일 권한 |
| `MAX_CONCURRENT_TASKS` | `1` | 동시에 실행할 전송 작업 수 |
| `COMMAND_TIMEOUT` | `300` | 일반 명령 제한 시간(초) |
| `HOST_DOWNLOAD_DIR` / `HOST_UPLOAD_DIR` | (없음) | 화면에 NAS 실제 경로를 보여주는 용도 |
| `TZ` | `Asia/Seoul` | 시간대 |

데이터 위치: 로그인 정보·설정은 `./config/pcs_config.json`, 작업 기록은 `./config/webui/tasks.json` 입니다.
`config/` 는 `.gitignore` 에 들어 있어 커밋되지 않습니다. **이 폴더를 다른 사람과 공유하지 마세요** (바이두 로그인 정보가 들어 있습니다).

## 외부 접속과 보안

8777 포트를 인터넷에 그대로 열지 마세요. 웹 UI 에 들어오면 바이두 계정을 마음대로 다룰 수 있습니다.
DSM **제어판 → 로그인 포털 → 고급 → 역방향 프록시** 로 HTTPS 를 붙이세요.

- 소스: `HTTPS`, 호스트 이름 `pan.내도메인`, 포트 443
- 대상: `HTTP`, `localhost`, 포트 8777
- **사용자 지정 머리글 → 생성 → WebSocket** 을 꼭 추가하세요 (터미널 화면에 필요)

## 문제 해결

- **다운로드가 바로 실패**: 전송 현황의 로그 아이콘에서 원문 메시지를 확인하세요. `permission denied` 가 보이면 PUID/PGID 사용자에게 다운로드 폴더 쓰기 권한이 있는지 확인합니다 (컨테이너 로그에도 경고가 나옵니다).
- **목록에서 `网络错误`**: NAS 가 바이두 서버에 접속하지 못하는 상태입니다. 필요하면 설정 → 네트워크 → 프록시.
- **`请先登录` / 용량을 못 가져옴**: 쿠키가 만료되었습니다. 다시 로그인하세요.
- **转存 실패**: STOKEN 이 포함된 Cookies 로 다시 로그인하세요.
- **터미널이 연결되지 않음**: 역방향 프록시를 쓰면 WebSocket 머리글을 추가했는지 확인하세요.

## 업데이트

- **git clone 으로 설치한 경우**: `git pull` 후 컨테이너 매니저에서 프로젝트 **정지 → 빌드 → 시작**.
- **zip 으로 설치한 경우**: 새 zip 으로 덮어쓴 뒤 같은 방법으로 다시 빌드. `config/` 폴더는 그대로 두세요.
- **BaiduPCS-Go 버전 변경**: `docker-compose.yml` 의 `PCS_VERSION` 을 바꾸고 `bin/` 의 바이너리를 지운 뒤 다시 빌드합니다.

## 개발

```sh
git clone https://github.com/yidu4you/baidupcs-webui.git
cd baidupcs-webui
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# BaiduPCS-Go 바이너리 경로와 작업 폴더를 지정해 실행
export PCS_BIN=/path/to/BaiduPCS-Go
export BAIDUPCS_GO_CONFIG_DIR=$PWD/config DOWNLOAD_DIR=$PWD/downloads UPLOAD_DIR=$PWD/uploads
uvicorn app.main:app --reload --port 8777
```

리눅스/macOS 에서 실행됩니다 (터미널 기능이 PTY 와 `setsid` 를 사용).

```
baidupcs-webui/
├─ app/
│  ├─ main.py        REST API, 인증, 정적 파일
│  ├─ pcs.py         CLI 실행, 출력 파서, 설정 스키마, 로그인 입력 정리
│  ├─ tasks.py       다운로드/업로드 작업 관리 (진행률 파싱, 저장, 재시도)
│  ├─ terminal.py    PTY 대화형 터미널 (WebSocket)
│  └─ settings.py    환경 변수
├─ static/           SPA (index.html, app.js, app.css, vendor/xterm.js)
├─ bin/              (선택) 오프라인 빌드용 BaiduPCS-Go 바이너리 — git 에 커밋하지 않음
├─ Dockerfile · entrypoint.sh · docker-compose.yml
├─ .github/          CI, 릴리즈(GHCR 이미지 + DSM zip), 이슈 템플릿
└─ VERSION · CHANGELOG.md · LICENSE · THIRD_PARTY_NOTICES.md
```

### 릴리즈 방법

1. `VERSION` 과 `CHANGELOG.md` 를 고칩니다 (예: `0.0.2`).
2. 커밋 후 태그를 올립니다.
   ```sh
   git tag -a v0.0.2 -m "v0.0.2"
   git push origin main --tags
   ```
3. GitHub Actions 가 이미지를 `ghcr.io/yidu4you/baidupcs-webui` 에 올리고, Release 에 DSM 용 zip 을 첨부합니다.
   태그와 `VERSION` 파일이 다르면 실패합니다.

## 라이선스

[MIT License](LICENSE) © 2026 yidu4you

BaiduPCS-Go (Apache-2.0), xterm.js (MIT) 등 다른 구성 요소의 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 를 참고하세요.
