"""환경변수 기반 설정."""
import os

PCS_BIN = os.environ.get("PCS_BIN", "/usr/local/bin/BaiduPCS-Go")
CONFIG_DIR = os.environ.get("BAIDUPCS_GO_CONFIG_DIR", "/config")
CONFIG_FILE = os.path.join(CONFIG_DIR, "pcs_config.json")
WEBUI_DIR = os.path.join(CONFIG_DIR, "webui")

DOWNLOAD_DIR = os.environ.get("DOWNLOAD_DIR", "/downloads")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/uploads")
# 화면 표시용: 컨테이너 폴더가 연결된 NAS 실제 경로 (docker-compose 에서 지정)
HOST_DOWNLOAD_DIR = os.environ.get("HOST_DOWNLOAD_DIR", "")
HOST_UPLOAD_DIR = os.environ.get("HOST_UPLOAD_DIR", "")

# 웹 UI 접속 비밀번호 (비워두면 인증 없이 사용)
WEB_PASSWORD = os.environ.get("WEB_PASSWORD", "")
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "30"))

# 동시에 실행할 다운로드/업로드 작업 수
MAX_CONCURRENT_TASKS = max(1, int(os.environ.get("MAX_CONCURRENT_TASKS", "1")))
# 다운로드 중 NAS 여유 공간이 이보다 작아지면 작업을 멈춘다 (예: 1GB, 500MB, 0 이면 끔)
def _parse_bytes(v: str) -> int:
    v = (v or "").strip().upper().replace(" ", "")
    units = {"TB": 1 << 40, "GB": 1 << 30, "MB": 1 << 20, "KB": 1 << 10, "B": 1}
    for u, m in units.items():
        if v.endswith(u):
            try:
                return int(float(v[: -len(u)]) * m)
            except ValueError:
                return 0
    try:
        return int(v)
    except ValueError:
        return 0


MIN_FREE_BYTES = _parse_bytes(os.environ.get("MIN_FREE_SPACE", "1GB"))
# 경유 모드에서 공유 파일을 잠깐 저장할 넷디스크 폴더
RELAY_ROOT = os.environ.get("RELAY_ROOT", "/_webui_relay").rstrip("/") or "/_webui_relay"
# 작업별 설정 복사본을 두는 폴더 (작업마다 계정을 고정하기 위함)
RUN_DIR = os.path.join(os.environ.get("BAIDUPCS_GO_CONFIG_DIR", "/config"), "webui", "run")

# 단일 명령 타임아웃(초)
COMMAND_TIMEOUT = int(os.environ.get("COMMAND_TIMEOUT", "300"))

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

# 컨테이너 내부 로컬 파일 루트 (브라우저에서 탐색/업로드 가능한 범위)
LOCAL_ROOTS = {
    "downloads": DOWNLOAD_DIR,
    "uploads": UPLOAD_DIR,
}

os.makedirs(WEBUI_DIR, exist_ok=True)
os.makedirs(RUN_DIR, exist_ok=True)
