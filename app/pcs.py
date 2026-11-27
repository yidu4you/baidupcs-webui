"""BaiduPCS-Go CLI 실행기, 출력 파서, 설정 파일 접근."""
from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
from typing import Any

from . import settings

# 짧은 명령들은 설정파일(pcs_config.json)을 동시에 쓰지 않도록 직렬화한다.
pcs_lock = asyncio.Lock()

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
DATE = r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"
SIZE_UNITS = {"B": 1, "KB": 1 << 10, "MB": 1 << 20, "GB": 1 << 30, "TB": 1 << 40, "PB": 1 << 50}


def child_env() -> dict:
    env = dict(os.environ)
    env["BAIDUPCS_GO_CONFIG_DIR"] = settings.CONFIG_DIR
    env.setdefault("LANG", "C.UTF-8")
    env["TERM"] = env.get("TERM") or "dumb"
    return env


def clean(text: str) -> str:
    text = ANSI_RE.sub("", text)
    # 캐리지 리턴으로 덮어쓰는 진행 표시는 마지막 상태만 남긴다
    lines = []
    for line in text.split("\n"):
        if "\r" in line:
            parts = [p for p in line.split("\r") if p.strip()]
            line = parts[-1] if parts else ""
        lines.append(line.rstrip())
    return "\n".join(lines).strip("\n")


async def run(args: list[str], timeout: int | None = None, stdin_data: str | None = None) -> tuple[int, str]:
    """BaiduPCS-Go 를 비대화식으로 실행하고 (returncode, output) 을 돌려준다."""
    async with pcs_lock:
        return await run_unlocked(args, timeout, stdin_data)


async def run_unlocked(args: list[str], timeout: int | None = None, stdin_data: str | None = None) -> tuple[int, str]:
    """pcs_lock 을 이미 잡은 상태에서 여러 명령을 이어서 실행할 때 쓴다."""
    timeout = timeout or settings.COMMAND_TIMEOUT
    proc = await asyncio.create_subprocess_exec(
        settings.PCS_BIN, *args,
        stdin=asyncio.subprocess.PIPE if stdin_data is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=child_env(),
        cwd=settings.CONFIG_DIR,
    )
    try:
        out, _ = await asyncio.wait_for(
            proc.communicate(stdin_data.encode() if stdin_data is not None else None), timeout
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return -1, f"명령이 {timeout}초 안에 끝나지 않아 중단했습니다."
    return proc.returncode or 0, clean(out.decode("utf-8", "replace"))


# ---------------------------------------------------------------- 크기 변환

def parse_size(s: str) -> int:
    s = (s or "").strip()
    m = re.match(r"^([\d.]+)\s*([KMGTP]?B)$", s, re.I)
    if not m:
        return 0
    return int(float(m.group(1)) * SIZE_UNITS[m.group(2).upper()])


def human_size(n: int | float) -> str:
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{int(n)}B" if unit == "B" else f"{n:.2f}{unit}"
        n /= 1024
    return f"{n:.2f}PB"


# ---------------------------------------------------------------- 파서

LS_L_ROW = re.compile(
    rf"^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+({DATE})\s+({DATE})\s+(.*?)\s*$"
)
MD5_PREFIX = re.compile(r"^((?:\(可能不正确\))?[0-9a-fA-F]{32})\s+(.*)$")


def parse_file_table(out: str, base: str | None = None) -> list[dict]:
    """`ls -l` / `search -l` 의 표 출력을 파싱한다."""
    items = []
    for line in out.splitlines():
        m = LS_L_ROW.match(line)
        if not m:
            continue
        idx, fsid, appid, size, ctime, mtime, rest = m.groups()
        is_dir = size == "-"
        md5 = ""
        name = rest
        if not is_dir:
            mm = MD5_PREFIX.match(rest)
            if mm:
                md5, name = mm.group(1), mm.group(2)
        if is_dir and name.endswith("/"):
            name = name[:-1]
        if base is not None:
            path = (base.rstrip("/") + "/" + name) if base != "/" else "/" + name
            display = name
        else:
            path = name
            display = name.rsplit("/", 1)[-1] or name
        items.append({
            "name": display,
            "path": path,
            "is_dir": is_dir,
            "size": 0 if is_dir else parse_size(size),
            "size_text": "" if is_dir else size,
            "ctime": ctime,
            "mtime": mtime,
            "fs_id": fsid,
            "md5": md5.replace("(可能不正确)", ""),
        })
    return items


def extract_current_dir(out: str) -> str | None:
    m = re.search(r"当前目录:\s*(.+)", out)
    return m.group(1).strip() if m else None


QUOTA_RE = re.compile(r"总空间:\s*([\d.]+\w+),\s*已用空间:\s*([\d.]+\w+)")


def parse_quota(out: str) -> dict | None:
    m = QUOTA_RE.search(out)
    if not m:
        return None
    total, used = parse_size(m.group(1)), parse_size(m.group(2))
    return {"total": total, "used": used, "total_text": m.group(1), "used_text": m.group(2)}


# ---------------------------------------------------------------- 설정 파일

def read_config() -> dict:
    try:
        with open(settings.CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


async def read_config_safe() -> dict:
    async with pcs_lock:
        return read_config()


def write_config_atomic(data: dict) -> None:
    fd, tmp = tempfile.mkstemp(dir=settings.CONFIG_DIR, prefix=".pcs_config.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, settings.CONFIG_FILE)


def public_accounts(cfg: dict) -> dict:
    """비밀값을 제외한 계정 정보."""
    active = cfg.get("baidu_active_uid") or 0
    users = []
    for i, u in enumerate(cfg.get("baidu_user_list") or []):
        users.append({
            "index": i,
            "uid": str(u.get("uid", "")),
            "name": u.get("name", ""),
            "sex": u.get("sex", ""),
            "age": u.get("age", 0),
            "workdir": u.get("workdir") or "/",
            "has_stoken": bool(u.get("stoken")),
            "has_cookies": bool(u.get("cookies")),
            "has_accesstoken": bool(u.get("accesstoken")),
            "active": str(u.get("uid")) == str(active),
        })
    current = next((u for u in users if u["active"]), None)
    return {"active_uid": str(active), "current": current, "accounts": users}


# BaiduPCS-Go `config set` 이 다루는 항목.
# key: pcs_config.json 의 키, flag: config set 플래그 이름
CONFIG_SCHEMA: list[dict[str, Any]] = [
    {"group": "다운로드", "key": "savedir", "flag": "savedir", "type": "string",
     "label": "저장 폴더", "help": "터미널에서 download 를 실행할 때 쓰는 기본 저장 위치입니다. 웹 다운로드는 작업마다 저장 위치를 고를 수 있습니다.",
     "default": settings.DOWNLOAD_DIR},
    {"group": "다운로드", "key": "max_parallel", "flag": "max_parallel", "type": "int",
     "label": "최대 연결 수", "help": "다운로드 전체 동시 연결 수. 일반 회원은 1, SVIP 는 10~20 권장 (일반 회원이 올리면 속도 제한에 걸리기 쉽습니다).",
     "default": 1, "hint": "1 ~ 20"},
    {"group": "다운로드", "key": "max_download_load", "flag": "max_download_load", "type": "int",
     "label": "동시 다운로드 파일 수", "help": "한 작업 안에서 동시에 받는 파일 수.", "default": 1, "hint": "1 ~ 5"},
    {"group": "다운로드", "key": "max_download_rate", "flag": "max_download_rate", "type": "rate",
     "label": "다운로드 속도 제한", "help": "0 이면 제한 없음. 예: 2MB, 500KB", "default": "0"},
    {"group": "다운로드", "key": "cache_size", "flag": "cache_size", "type": "size",
     "label": "다운로드 캐시", "help": "디스크 사용률이 높거나 속도가 느리면 늘려 보세요. 예: 64KB, 256KB", "default": "64KB", "hint": "1KB ~ 256KB"},
    {"group": "다운로드", "key": "no_check", "flag": None, "type": "bool",
     "label": "다운로드 후 MD5 검증 생략", "help": "켜면 완료 후 파일 검증을 건너뜁니다.", "default": True},
    {"group": "업로드", "key": "max_upload_parallel", "flag": "max_upload_parallel", "type": "int",
     "label": "파일당 업로드 연결 수", "help": "", "default": 4, "hint": "1 ~ 100"},
    {"group": "업로드", "key": "max_upload_load", "flag": "max_upload_load", "type": "int",
     "label": "동시 업로드 파일 수", "help": "", "default": 4, "hint": "1 ~ 4"},
    {"group": "업로드", "key": "max_upload_rate", "flag": "max_upload_rate", "type": "rate",
     "label": "업로드 속도 제한", "help": "0 이면 제한 없음.", "default": "0"},
    {"group": "업로드", "key": "u_policy", "flag": "upload_policy", "type": "select",
     "options": [["skip", "건너뛰기"], ["overwrite", "덮어쓰기"], ["rsync", "크기가 다를 때만 덮어쓰기"]],
     "label": "같은 이름 파일 처리", "help": "", "default": "skip"},
    {"group": "업로드", "key": "ignore_illegal", "flag": "ignore_illegal", "type": "bool",
     "label": "파일명 금지 문자 검사 끄기", "help": "", "default": False},
    {"group": "네트워크", "key": "enable_https", "flag": "enable_https", "type": "bool",
     "label": "HTTPS 사용", "help": "", "default": True},
    {"group": "네트워크", "key": "proxy", "flag": "proxy", "type": "string",
     "label": "프록시", "help": "http 또는 socks5. 예: socks5://192.168.0.10:1080", "default": ""},
    {"group": "네트워크", "key": "proxy_hostnames", "flag": "proxy_hostnames", "type": "string",
     "label": "프록시 적용 도메인", "help": "쉼표로 구분. 비워두면 모든 요청에 프록시를 씁니다. 해외 서버에서 업로드가 안 되면 pan.baidu.com 만 지정해 보세요.", "default": ""},
    {"group": "네트워크", "key": "local_addrs", "flag": "local_addrs", "type": "string",
     "label": "로컬 네트워크 주소", "help": "여러 개면 쉼표로 구분.", "default": ""},
    {"group": "네트워크", "key": "pcs_addr", "flag": "pcs_addr", "type": "string",
     "label": "PCS 서버 주소", "help": "pcs.baidu.com, c.pcs.baidu.com, c2~c5.pcs.baidu.com, d.pcs.baidu.com", "default": "pcs.baidu.com"},
    {"group": "네트워크", "key": "fix_pcs_addr", "flag": "fix_pcs_addr", "type": "bool",
     "label": "PCS 서버 고정", "help": "업로드 때 동적 서버 대신 위 주소를 고정해서 씁니다.", "default": False},
    {"group": "고급", "key": "appid", "flag": "appid", "type": "int",
     "label": "PCS 앱 ID", "help": "바꾸면 접속 오류가 날 수 있습니다.", "default": 266719},
    {"group": "고급", "key": "user_agent", "flag": "user_agent", "type": "string",
     "label": "User-Agent", "help": "바꾸면 접속 오류가 날 수 있습니다.",
     "default": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36"},
    {"group": "고급", "key": "pcs_ua", "flag": "pcs_ua", "type": "string",
     "label": "PCS User-Agent", "help": "", "default": ""},
    {"group": "고급", "key": "pan_ua", "flag": "pan_ua", "type": "string",
     "label": "Pan User-Agent", "help": "",
     "default": "netdisk;P2SP;3.0.0.8;netdisk;11.12.3;ANG-AN00;android-android;10.0;JSbridge4.4.0;jointBridge;1.1.0;"},
    {"group": "고급", "key": "force_login_username", "flag": "force_login_username", "type": "string",
     "label": "강제 로그인 사용자명", "help": "tieba 사용자 정보 API 가 막혔을 때만 사용. 평소엔 비워두세요.", "default": ""},
]


def config_values(cfg: dict) -> dict:
    vals = {}
    for f in CONFIG_SCHEMA:
        v = cfg.get(f["key"], f["default"])
        if f["type"] in ("size", "rate"):
            n = int(v or 0)
            v = "0" if n == 0 else human_size(n).replace(".00", "")
        vals[f["key"]] = v
    return vals


def to_flag_value(field: dict, value: Any) -> str:
    if field["type"] == "bool":
        return "true" if value in (True, "true", "1", 1, "on") else "false"
    if field["type"] == "int":
        return str(int(value))
    return "" if value is None else str(value)


# ---------------------------------------------------------------- 목록형 출력 파서

RECYCLE_ROW = re.compile(
    rf"^\s*(\d+)\s+(\d{{5,}})\s+(\S+)\s+({DATE})\s+({DATE})\s+(.*?)\s+(-?\d+)\s+(/.*?)\s*$"
)


def parse_recycle(out: str) -> list[dict]:
    items = []
    for line in out.splitlines():
        m = RECYCLE_ROW.match(line)
        if not m:
            continue
        _, fsid, size, ctime, mtime, md5, left, path = m.groups()
        is_dir = size == "-"
        items.append({"fs_id": fsid, "path": path.rstrip("/") or "/", "is_dir": is_dir,
                      "size": 0 if is_dir else parse_size(size), "size_text": "" if is_dir else size,
                      "mtime": mtime, "left_days": int(left)})
    return items


SHARE_ROW = re.compile(r"^\s*(\d+)\s+(\d+)\s+(https?://\S+)\s+(.*?)\s+(-?\d+)\s*$")


def parse_share_list(out: str) -> list[dict]:
    items = []
    for line in out.splitlines():
        m = SHARE_ROW.match(line)
        if not m:
            continue
        _, sid, link, rest, views = m.groups()
        pwd = ""
        tokens = rest.split()
        if tokens and not tokens[0].startswith("/"):
            pwd = tokens[0]
            rest = rest[len(pwd):].strip()
        # rest = "<특징 디렉터리> <특징 경로> <만료>" — 경로는 마지막 '/' 로 시작하는 토큰부터
        idx = rest.rfind(" /")
        typical = rest[idx + 1:] if idx >= 0 else rest
        valid = ""
        mm = re.match(r"^(/.*?)\s{2,}(\S.*)$", typical)
        if mm:
            typical, valid = mm.group(1), mm.group(2)
        items.append({"share_id": sid, "link": link, "pwd": pwd,
                      "full_link": f"{link}?pwd={pwd}" if pwd else link,
                      "path": typical.strip(), "valid": valid.strip(), "views": int(views)})
    return items


OFFLINE_ROW = re.compile(
    rf"^\s*(\d+)\s+(\d+)\s+(.*?)\s+(\d[\d.]*[KMGTP]?B)\s+({DATE})\s+(/.*?)\s+(\S+)\s+(\S+)\s*$"
)
OFFLINE_STATUS = {
    "下载成功": ("완료", "ok"), "下载进行中": ("진행 중", "accent"), "系统错误": ("시스템 오류", "danger"),
    "资源不存在": ("리소스 없음", "danger"), "下载超时": ("시간 초과", "danger"),
    "资源存在但下载失败": ("다운로드 실패", "danger"), "存储空间不足": ("저장 공간 부족", "danger"),
    "任务取消": ("취소됨", "warn"), "目标地址数据已存在": ("이미 있음", "warn"), "已删除": ("삭제됨", "warn"),
}


def parse_offline_list(out: str) -> list[dict]:
    items = []
    for line in out.splitlines():
        m = OFFLINE_ROW.match(line)
        if not m:
            continue
        _, tid, name, size, created, save, url, status = m.groups()
        label, tone = OFFLINE_STATUS.get(status, (status, ""))
        items.append({"task_id": tid, "name": name, "size_text": size, "created": created,
                      "save_path": save, "url": url, "status": status, "status_label": label, "tone": tone})
    return items


# ---------------------------------------------------------------- 로그인 입력 정리

def _strip_value(v: str, key: str) -> str:
    """사용자가 'BDUSS=xxx;' 나 따옴표째 붙여넣은 값을 순수 값으로 정리한다."""
    v = (v or "").strip().strip('"').strip("'").strip()
    if v.upper().startswith(key.upper() + "="):
        v = v[len(key) + 1:]
    return v.split(";")[0].strip().strip('"').strip("'")


def normalize_cookies(raw: str) -> str:
    """브라우저에서 복사한 Cookie 헤더를 BaiduPCS-Go 가 읽을 수 있는 형태로 정리한다.

    - 'Cookie:' 접두어, 줄바꿈, 앞뒤 따옴표 제거
    - 값 안의 큰따옴표 제거 (v4.0.2 에서 invalid byte 오류 원인)
    - 마지막에 ';' 보장 (BaiduPCS-Go 가 `BDUSS=(.+?);` 로 BDUSS 를 찾음)
    - DevTools 의 표 형식(이름<TAB>값 …)으로 붙여넣은 경우도 처리
    """
    text = (raw or "").strip().strip('"').strip("'")
    text = re.sub(r"^\s*cookie\s*:\s*", "", text, flags=re.I)
    pairs: list[tuple[str, str]] = []
    if "\t" in text and "=" not in text.split("\n")[0]:
        # Application 탭의 표를 그대로 복사한 경우: name \t value \t ...
        for line in text.splitlines():
            cols = line.split("\t")
            if len(cols) >= 2 and cols[0].strip():
                pairs.append((cols[0].strip(), cols[1].strip()))
    else:
        for part in re.split(r";|\n", text):
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip()
            if k:
                pairs.append((k, v.strip()))
    seen = {}
    for k, v in pairs:
        seen[k] = v.replace('"', "")
    return "; ".join(f"{k}={v}" for k, v in seen.items()) + ";" if seen else ""


def cookie_value(cookies: str, key: str) -> str:
    m = re.search(r"(?:^|;\s*)" + re.escape(key) + r"=([^;]*)", cookies)
    return m.group(1).strip() if m else ""


TIEBA_FAIL_RE = re.compile(r"检测BDUSS有效性错误代码")
