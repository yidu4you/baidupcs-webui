"""BaiduPCS-Go Web UI - FastAPI 백엔드."""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import secrets
import shlex
import shutil
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import notify, pcs, settings
from .tasks import manager
from .terminal import terminal_session

def _read_version() -> str:
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "VERSION")) as f:
            return f.read().strip() or "0.0.0"
    except OSError:
        return "0.0.0"


VERSION = _read_version()
SESSION_COOKIE = "pcsweb_session"
SESSIONS_FILE = os.path.join(settings.WEBUI_DIR, "sessions.json")


# ======================================================================= 시작
async def _bootstrap():
    """처음 실행 시 저장 폴더를 컨테이너 다운로드 경로로 맞춘다."""
    for d in (settings.DOWNLOAD_DIR, settings.UPLOAD_DIR):
        os.makedirs(d, exist_ok=True)
    first_run = not os.path.exists(settings.CONFIG_FILE)
    await pcs.run(["config"], timeout=30)  # 설정파일이 없으면 생성됨
    cfg = pcs.read_config()
    savedir = cfg.get("savedir", "")
    if first_run or not savedir or savedir.endswith("/Downloads") and not savedir.startswith(settings.DOWNLOAD_DIR):
        await pcs.run(["config", "set", f"--savedir={settings.DOWNLOAD_DIR}"], timeout=30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _bootstrap()
    manager.start()
    yield
    manager.save(force=True)


app = FastAPI(title="BaiduPCS-Go Web", version=VERSION, lifespan=lifespan, docs_url=None, redoc_url=None)


# ======================================================================= 인증
def _load_sessions() -> dict:
    try:
        with open(SESSIONS_FILE, "r") as f:
            data = json.load(f)
        t = time.time()
        return {k: v for k, v in data.items() if v > t}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


SESSIONS = _load_sessions()


def _save_sessions():
    with open(SESSIONS_FILE, "w") as f:
        json.dump(SESSIONS, f)


def _authed(token: str | None) -> bool:
    if not settings.WEB_PASSWORD:
        return True
    if not token:
        return False
    exp = SESSIONS.get(token)
    return bool(exp and exp > time.time())


OPEN_PATHS = ("/api/auth/", "/api/health")


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not path.startswith(OPEN_PATHS):
        if not _authed(request.cookies.get(SESSION_COOKIE)):
            return JSONResponse({"detail": "로그인이 필요합니다."}, status_code=401)
    return await call_next(request)


class LoginBody(BaseModel):
    password: str


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/auth/status")
async def auth_status(request: Request):
    return {"required": bool(settings.WEB_PASSWORD), "authed": _authed(request.cookies.get(SESSION_COOKIE))}


@app.post("/api/auth/login")
async def auth_login(body: LoginBody):
    if not settings.WEB_PASSWORD:
        return {"ok": True}
    if not hmac.compare_digest(body.password.encode(), settings.WEB_PASSWORD.encode()):
        await asyncio.sleep(1)
        raise HTTPException(401, "비밀번호가 맞지 않습니다.")
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = time.time() + settings.SESSION_DAYS * 86400
    _save_sessions()
    resp = JSONResponse({"ok": True})
    resp.set_cookie(SESSION_COOKIE, token, max_age=settings.SESSION_DAYS * 86400, httponly=True, samesite="lax")
    return resp


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    SESSIONS.pop(request.cookies.get(SESSION_COOKIE, ""), None)
    _save_sessions()
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE)
    return resp


# ======================================================================= 공통
def _ok(rc: int, out: str, **extra) -> dict:
    return {"ok": rc == 0, "output": out, **extra}


def _clean_paths(paths: list[str]) -> list[str]:
    res = [p.strip() for p in paths if p and p.strip()]
    if not res:
        raise HTTPException(400, "경로를 하나 이상 지정하세요.")
    return res


def _abs(p: str) -> str:
    p = (p or "/").strip()
    return p if p.startswith("/") else "/" + p


FAIL_HINTS = ("失败", "错误", "error", "Error", "请先登录", "不存在", "not exist", "遇到错误")


def _looks_failed(out: str) -> bool:
    return any(h in out for h in FAIL_HINTS)


# ======================================================================= 정보/계정
@app.get("/api/info")
async def info():
    cfg = await pcs.read_config_safe()
    rc, ver = await pcs.run(["--version"], timeout=15)
    return {
        "webui_version": VERSION,
        "pcs_version": ver.split()[-1] if ver else "",
        "download_dir": settings.DOWNLOAD_DIR,
        "upload_dir": settings.UPLOAD_DIR,
        "host_download_dir": settings.HOST_DOWNLOAD_DIR,
        "host_upload_dir": settings.HOST_UPLOAD_DIR,
        "config_dir": settings.CONFIG_DIR,
        "max_concurrent_tasks": settings.MAX_CONCURRENT_TASKS,
        "min_free_bytes": settings.MIN_FREE_BYTES,
        "relay_root": settings.RELAY_ROOT,
        **pcs.public_accounts(cfg),
    }


class AccountLogin(BaseModel):
    mode: str = "bduss"   # bduss | cookies
    bduss: str = ""
    stoken: str = ""
    ptoken: str = ""
    cookies: str = ""
    # 티에바(贴吧) BDUSS 검증 서버가 거부할 때 검증을 건너뛰고 로그인 (force_login_username)
    skip_check: bool = False
    name: str = ""


@app.post("/api/account/login")
async def account_login(body: AccountLogin):
    warnings: list[str] = []
    if body.mode == "cookies":
        cookies = pcs.normalize_cookies(body.cookies)
        bduss = pcs.cookie_value(cookies, "BDUSS")
        if not bduss:
            raise HTTPException(400, "Cookies 안에 BDUSS 가 없습니다. BDUSS 는 HttpOnly 쿠키라서 콘솔의 document.cookie 로는 복사되지 않습니다. "
                                     "F12 → Network 탭 → 새로고침 → 요청 선택 → Request Headers 의 Cookie 값을 복사하세요.")
        if not pcs.cookie_value(cookies, "STOKEN"):
            warnings.append("Cookies 에 STOKEN 이 없습니다. 공유 링크 저장(转存)을 하려면 pan.baidu.com 페이지에서 복사한 Cookies 가 필요합니다.")
        args = ["login", f"--cookies={cookies}"]
    else:
        bduss = pcs._strip_value(body.bduss, "BDUSS")
        stoken = pcs._strip_value(body.stoken, "STOKEN")
        ptoken = pcs._strip_value(body.ptoken, "PTOKEN")
        if not bduss:
            raise HTTPException(400, "BDUSS 값을 입력하세요.")
        args = ["login", f"--bduss={bduss}"]
        if stoken:
            args.append(f"--stoken={stoken}")
        else:
            warnings.append("STOKEN 이 없으면 공유 링크 저장(转存)을 할 수 없습니다.")
        if ptoken:
            args.append(f"--ptoken={ptoken}")
    if len(bduss) < 150:
        warnings.append(f"BDUSS 가 {len(bduss)}자입니다. 보통 192자이므로 일부만 복사했거나 BDUSS_BFESS 등 다른 값을 복사했을 수 있습니다.")

    verified = None
    async with pcs.pcs_lock:
        prev_force = pcs.read_config().get("force_login_username", "") or ""
        if body.skip_check:
            name = (body.name or "").strip() or "baidu"
            await pcs.run_unlocked(["config", "set", f"--force_login_username={name}"], timeout=30)
        try:
            rc, out = await pcs.run_unlocked(args, timeout=60)
        finally:
            if body.skip_check:
                # 전역 설정이라 바로 원래 값으로 돌려놓는다
                await pcs.run_unlocked(["config", "set", f"--force_login_username={prev_force}"], timeout=30)
        success = "登录成功" in out
        if success:
            # 넷디스크에 실제로 접속되는지 확인
            qrc, qout = await pcs.run_unlocked(["quota"], timeout=60)
            verified = pcs.parse_quota(qout) is not None
            if not verified:
                if body.skip_check:
                    # 검증을 건너뛰었는데 넷디스크도 안 열리면 BDUSS 자체가 무효 → 방금 추가한 계정을 지운다
                    await pcs.run_unlocked(["logout", "-y"], timeout=30)
                    success = False
                    out += "\n\n[넷디스크 접속 확인 실패 → 등록을 취소했습니다]\n" + qout
                else:
                    warnings.append("로그인은 됐지만 넷디스크 접속 확인에 실패했습니다: " + qout.strip()[:200])
    cfg = await pcs.read_config_safe()
    tieba_failed = (not success) and not body.skip_check and bool(pcs.TIEBA_FAIL_RE.search(out))
    return {"ok": success, "output": out, "warnings": warnings, "verified": verified,
            "tieba_failed": tieba_failed, **pcs.public_accounts(cfg)}


class UidBody(BaseModel):
    uid: str


@app.post("/api/account/su")
async def account_su(body: UidBody):
    rc, out = await pcs.run(["su", body.uid])
    cfg = await pcs.read_config_safe()
    return {"ok": "切换用户:" in out, "output": out, **pcs.public_accounts(cfg)}


@app.post("/api/account/logout")
async def account_logout():
    rc, out = await pcs.run(["logout", "-y"])
    cfg = await pcs.read_config_safe()
    return {"ok": True, "output": out, **pcs.public_accounts(cfg)}


class TokenBody(BaseModel):
    token: str


@app.post("/api/account/astoken")
async def account_astoken(body: TokenBody):
    rc, out = await pcs.run(["setastoken", body.token.strip()])
    return _ok(rc, out)


@app.get("/api/quota")
async def quota():
    rc, out = await pcs.run(["quota"], timeout=60)
    q = pcs.parse_quota(out)
    return {"ok": q is not None, "quota": q, "output": out}


# ======================================================================= 넷디스크 파일
@app.get("/api/fs/ls")
async def fs_ls(path: str = "/", sort: str = "name", order: str = "asc"):
    path = _abs(path)
    args = ["ls", "-l"]
    if sort in ("name", "time", "size"):
        args.append(f"--{sort}")
    args.append("--desc" if order == "desc" else "--asc")
    args.append(path)
    rc, out = await pcs.run(args, timeout=120)
    cur = pcs.extract_current_dir(out)
    if cur is None:
        return {"ok": False, "path": path, "items": [], "output": out}
    items = pcs.parse_file_table(out, base=cur)
    return {"ok": True, "path": cur, "items": items}


@app.get("/api/fs/tree")
async def fs_tree(path: str = "/", depth: int = -1, fsid: bool = False):
    args = ["tree", f"--depth={depth}"]
    if fsid:
        args.append("--fsid")
    args.append(_abs(path))
    rc, out = await pcs.run(args, timeout=600)
    return _ok(rc, out)


@app.get("/api/fs/meta")
async def fs_meta(path: str):
    rc, out = await pcs.run(["meta", _abs(path)])
    return _ok(rc, out)


@app.get("/api/fs/search")
async def fs_search(keyword: str, path: str = "/", recursive: bool = True):
    args = ["search", "-l", f"--path={_abs(path)}"]
    if recursive:
        args.append("-r")
    args.append(keyword)
    rc, out = await pcs.run(args, timeout=300)
    items = pcs.parse_file_table(out, base=None)
    return {"ok": True, "items": items, "output": out if not items else ""}


class PathBody(BaseModel):
    path: str


class PathsBody(BaseModel):
    paths: list[str]


class CopyMoveBody(BaseModel):
    paths: list[str]
    dest: str


class RenameBody(BaseModel):
    path: str
    new_name: str


@app.post("/api/fs/mkdir")
async def fs_mkdir(body: PathBody):
    rc, out = await pcs.run(["mkdir", _abs(body.path)])
    return {"ok": not _looks_failed(out), "output": out}


@app.post("/api/fs/rm")
async def fs_rm(body: PathsBody):
    rc, out = await pcs.run(["rm", *map(_abs, _clean_paths(body.paths))])
    return {"ok": not _looks_failed(out), "output": out}


@app.post("/api/fs/cp")
async def fs_cp(body: CopyMoveBody):
    rc, out = await pcs.run(["cp", *map(_abs, _clean_paths(body.paths)), _abs(body.dest)], timeout=600)
    return {"ok": not _looks_failed(out), "output": out}


@app.post("/api/fs/mv")
async def fs_mv(body: CopyMoveBody):
    rc, out = await pcs.run(["mv", *map(_abs, _clean_paths(body.paths)), _abs(body.dest)], timeout=600)
    return {"ok": not _looks_failed(out), "output": out}


@app.post("/api/fs/rename")
async def fs_rename(body: RenameBody):
    src = _abs(body.path).rstrip("/")
    if "/" in body.new_name or not body.new_name.strip():
        raise HTTPException(400, "새 이름에 / 를 쓸 수 없습니다.")
    dest = src.rsplit("/", 1)[0] + "/" + body.new_name.strip()
    rc, out = await pcs.run(["mv", src, dest])
    return {"ok": not _looks_failed(out), "output": out}


class LocateBody(BaseModel):
    paths: list[str]
    pan: bool = False


@app.post("/api/fs/locate")
async def fs_locate(body: LocateBody):
    args = ["locate"] + (["--pan"] if body.pan else []) + list(map(_abs, _clean_paths(body.paths)))
    rc, out = await pcs.run(args, timeout=120)
    return _ok(rc, out)


class ExportBody(BaseModel):
    paths: list[str]
    root: str = ""
    link: bool = False


@app.post("/api/fs/export")
async def fs_export(body: ExportBody):
    args = ["export"]
    if body.root:
        args.append(f"--root={body.root}")
    if body.link:
        args.append("--link")
    args += list(map(_abs, _clean_paths(body.paths)))
    rc, out = await pcs.run(args, timeout=600)
    return _ok(rc, out)


@app.get("/api/fs/match")
async def fs_match(pattern: str):
    rc, out = await pcs.run(["match", pattern])
    return _ok(rc, out)


# ======================================================================= 전송(转存)
class DownloadOptions(BaseModel):
    saveto: str = ""
    overwrite: bool = False
    mode: str = "locate"
    threads: int = 0
    load: int = 0
    retry: int = 3
    nocheck: bool = False
    mtime: bool = False
    fullpath: bool = False
    test: bool = False
    dindex: int = 0
    exec_perm: bool = False


class TransferBody(BaseModel):
    link: str
    code: str = ""
    dest: str = "/"
    # save: 넷디스크에만 저장 / download: 저장 후 NAS 로 다운로드 / relay: 다운로드 후 넷디스크에서 삭제
    mode: str = "save"
    download: bool = False      # 예전 방식 호환 (mode="download" 와 같음)
    collect: bool = False
    rname: bool = False
    fs_id: str = ""
    saveto: str = ""
    purge_recycle: bool = True
    options: DownloadOptions | None = None


@app.post("/api/transfer")
async def transfer(body: TransferBody):
    mode = "download" if body.download and body.mode == "save" else body.mode
    link, code = body.link.strip(), body.code.strip()
    if not link:
        raise HTTPException(400, "공유 링크를 입력하세요.")
    dest = _abs(body.dest)
    if mode in ("download", "relay"):
        acct = await _account_meta()
        saveto = _resolve_local(None, None, body.saveto or settings.DOWNLOAD_DIR)
        o = body.options or DownloadOptions()
        meta = {
            **acct, "link": link, "code": code, "collect": body.collect, "rname": body.rname,
            "fs_id": body.fs_id.strip(), "saveto": saveto, "dl_flags": _download_flags(o),
            "delete_after": mode == "relay", "purge_recycle": body.purge_recycle, "stage": "transfer",
        }
        label = "공유 링크" + (f" ({code})" if code else "")
        t = manager.add("relay", label, [], meta)
        # 경유 모드는 작업마다 전용 임시 폴더를 써서, 받은 뒤 그 폴더만 지운다
        t.meta["netdisk_dir"] = f"{settings.RELAY_ROOT}/{t.id}" if mode == "relay" else dest
        manager.save(force=True)
        return {"ok": True, "task": t.to_dict(), "output": "전송 현황에 작업을 추가했습니다."}
    args = ["transfer"]
    if body.collect:
        args.append("--collect")
    if body.rname:
        args.append("--rname")
    if body.fs_id.strip():
        args.append(f"--fs_id={body.fs_id.strip()}")
    args.append(link)
    if code:
        args.append(code)
    # transfer 는 현재 작업 디렉터리에 저장되므로 먼저 cd 한다
    rc1, out1 = await pcs.run(["cd", dest])
    rc, out = await pcs.run(args, timeout=300)
    ok = "成功" in out and not _looks_failed(out.replace("成功", ""))
    hint = ""
    if not ok and ("空间" in out or "容量" in out):
        hint = "넷디스크 용량이 부족한 것 같습니다. 휴지통을 비우거나, ‘받고 넷디스크에서 삭제(경유)’ 모드를 써 보세요."
    return {"ok": ok, "output": out, "hint": hint}


# ======================================================================= 공유
class ShareSetBody(BaseModel):
    paths: list[str]
    code: str = ""
    period: int = 0
    full: bool = True


@app.post("/api/share/set")
async def share_set(body: ShareSetBody):
    args = ["share", "set", f"--period={body.period}"]
    if body.code.strip():
        args.append(f"-p={body.code.strip()}")
    if body.full:
        args.append("-f")
    args += list(map(_abs, _clean_paths(body.paths)))
    rc, out = await pcs.run(args)
    return {"ok": not _looks_failed(out), "output": out}


@app.get("/api/share/list")
async def share_list(page: int = 1):
    rc, out = await pcs.run(["share", "list", f"--page={page}"])
    return _ok(rc, out, items=pcs.parse_share_list(out))


class IdsBody(BaseModel):
    ids: list[str] = Field(default_factory=list)
    all: bool = False


@app.post("/api/share/cancel")
async def share_cancel(body: IdsBody):
    rc, out = await pcs.run(["share", "cancel", *_clean_paths(body.ids)])
    return {"ok": not _looks_failed(out), "output": out}


# ======================================================================= 오프라인 다운로드
class OfflineAddBody(BaseModel):
    path: str = "/"
    urls: list[str]


@app.post("/api/offline/add")
async def offline_add(body: OfflineAddBody):
    rc, out = await pcs.run(["offlinedl", "add", f"--path={_abs(body.path)}", *_clean_paths(body.urls)])
    return {"ok": not _looks_failed(out), "output": out}


@app.get("/api/offline/list")
async def offline_list():
    rc, out = await pcs.run(["offlinedl", "list"])
    return _ok(rc, out, items=pcs.parse_offline_list(out))


@app.post("/api/offline/{action}")
async def offline_action(action: str, body: IdsBody):
    if action not in ("query", "cancel", "delete"):
        raise HTTPException(404)
    if action == "delete" and body.all:
        args = ["offlinedl", "delete", "--all"]
    else:
        args = ["offlinedl", action, *_clean_paths(body.ids)]
    rc, out = await pcs.run(args)
    return {"ok": not _looks_failed(out), "output": out}


# ======================================================================= 휴지통
@app.get("/api/recycle/list")
async def recycle_list(page: int = 1):
    rc, out = await pcs.run(["recycle", "list", f"--page={page}"])
    return _ok(rc, out, items=pcs.parse_recycle(out))


@app.post("/api/recycle/{action}")
async def recycle_action(action: str, body: IdsBody):
    if action not in ("restore", "delete"):
        raise HTTPException(404)
    if action == "delete" and body.all:
        args = ["recycle", "delete", "--all"]
    else:
        args = ["recycle", action, *_clean_paths(body.ids)]
    rc, out = await pcs.run(args)
    return {"ok": not _looks_failed(out), "output": out}


# ======================================================================= 작업 (다운로드/업로드)
class DownloadBody(BaseModel):
    paths: list[str]
    options: DownloadOptions = DownloadOptions()
    separate: bool = False   # 경로마다 작업을 나눌지


def _resolve_local(root_key: str | None, rel: str | None, abs_path: str | None = None) -> str:
    if abs_path:
        real = os.path.realpath(abs_path)
    else:
        base = settings.LOCAL_ROOTS.get(root_key or "")
        if not base:
            raise HTTPException(400, "알 수 없는 로컬 폴더입니다.")
        real = os.path.realpath(os.path.join(base, (rel or "").lstrip("/")))
    for base in settings.LOCAL_ROOTS.values():
        b = os.path.realpath(base)
        if real == b or real.startswith(b + os.sep):
            return real
    raise HTTPException(400, "허용된 폴더(다운로드/업로드) 밖의 경로입니다.")


async def _account_meta() -> dict:
    """작업을 만든 시점의 활성 계정. 작업은 나중에 시작돼도 이 계정으로 실행된다."""
    cfg = await pcs.read_config_safe()
    cur = pcs.public_accounts(cfg)["current"]
    if not cur:
        raise HTTPException(400, "먼저 바이두 계정에 로그인하세요.")
    return {"uid": cur["uid"], "account": cur["name"] or cur["uid"]}


def _download_flags(o: DownloadOptions) -> list[str]:
    flags = [f"--mode={o.mode}", f"--retry={o.retry}"]
    if o.overwrite:
        flags.append("--ow")
    if o.threads > 0:
        flags.append(f"-p={o.threads}")
    if o.load > 0:
        flags.append(f"-l={o.load}")
    if o.nocheck:
        flags.append("--nocheck")
    if o.mtime:
        flags.append("--mtime")
    if o.fullpath:
        flags.append("--fullpath")
    if o.test:
        flags.append("--test")
    if o.dindex > 0:
        flags.append(f"--dindex={o.dindex}")
    if o.exec_perm:
        flags.append("-x")
    return flags


@app.post("/api/tasks/download")
async def task_download(body: DownloadBody):
    o = body.options
    saveto = _resolve_local(None, None, o.saveto or settings.DOWNLOAD_DIR)
    os.makedirs(saveto, exist_ok=True)
    flags = [f"--saveto={saveto}", *_download_flags(o)]
    acct = await _account_meta()
    paths = list(map(_abs, _clean_paths(body.paths)))
    groups = [[p] for p in paths] if body.separate else [paths]
    created = []
    for g in groups:
        title = g[0].rstrip("/").rsplit("/", 1)[-1] or "/"
        if len(g) > 1:
            title += f" 외 {len(g) - 1}개"
        t = manager.add("download", title, ["download", *flags, *g], {"paths": g, "saveto": saveto, **acct})
        created.append(t.to_dict())
    return {"ok": True, "tasks": created}


class UploadOptions(BaseModel):
    norapid: bool = False
    policy: str = ""
    threads: int = 0
    load: int = 0
    retry: int = 3


class UploadBody(BaseModel):
    local_paths: list[str]
    dest: str
    options: UploadOptions = UploadOptions()


@app.post("/api/tasks/upload")
async def task_upload(body: UploadBody):
    o = body.options
    locals_ = [_resolve_local(None, None, p) for p in _clean_paths(body.local_paths)]
    flags = [f"--retry={o.retry}"]
    if o.norapid:
        flags.append("--norapid")
    if o.policy in ("skip", "overwrite", "rsync"):
        flags.append(f"--policy={o.policy}")
    if o.threads > 0:
        flags.append(f"-p={o.threads}")
    if o.load > 0:
        flags.append(f"-l={o.load}")
    dest = _abs(body.dest)
    title = os.path.basename(locals_[0].rstrip("/")) + (f" 외 {len(locals_) - 1}개" if len(locals_) > 1 else "")
    acct = await _account_meta()
    t = manager.add("upload", f"{title} → {dest}", ["upload", *flags, *locals_, dest], {"local_paths": locals_, "dest": dest, **acct})
    return {"ok": True, "task": t.to_dict()}


@app.get("/api/tasks")
async def tasks_list():
    return {"tasks": manager.list(), "running": manager.running_count()}


@app.get("/api/tasks/{tid}")
async def task_get(tid: str):
    t = manager.get(tid)
    if not t:
        raise HTTPException(404, "작업을 찾을 수 없습니다.")
    return t.to_dict(with_log=True)


@app.post("/api/tasks/{tid}/stop")
async def task_stop(tid: str):
    return {"ok": await manager.stop(tid)}


@app.post("/api/tasks/{tid}/retry")
async def task_retry(tid: str):
    return {"ok": manager.retry(tid)}


@app.delete("/api/tasks/{tid}")
async def task_delete(tid: str):
    return {"ok": await manager.remove(tid)}


@app.post("/api/tasks/clear")
async def tasks_clear():
    return {"ok": True, "removed": manager.clear_finished()}


# ======================================================================= 로컬 파일 (NAS)
@app.get("/api/local/list")
async def local_list(root: str = "downloads", path: str = ""):
    real = _resolve_local(root, path)
    if not os.path.isdir(real):
        raise HTTPException(404, "폴더가 없습니다.")
    base = os.path.realpath(settings.LOCAL_ROOTS[root])
    items = []
    with os.scandir(real) as it:
        for e in it:
            if e.name.startswith(".BaiduPCS-Go"):
                continue
            try:
                st = e.stat()
            except OSError:
                continue
            is_dir = e.is_dir()
            items.append({
                "name": e.name,
                "rel": os.path.relpath(e.path, base),
                "abs": e.path,
                "is_dir": is_dir,
                "size": 0 if is_dir else st.st_size,
                "mtime": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime)),
            })
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    usage = shutil.disk_usage(real)
    rel = os.path.relpath(real, base)
    return {"root": root, "base": base, "path": "" if rel == "." else rel, "abs": real, "items": items,
            "disk": {"total": usage.total, "used": usage.used, "free": usage.free}}


@app.post("/api/local/upload")
async def local_upload(root: str = Form("uploads"), path: str = Form(""), files: list[UploadFile] = File(...)):
    target = _resolve_local(root, path)
    os.makedirs(target, exist_ok=True)
    saved = []
    for uf in files:
        # 폴더 업로드 시 상대 경로(a/b/c.txt)를 유지
        rel = os.path.normpath(uf.filename or "file").lstrip("/")
        if rel.startswith(".."):
            raise HTTPException(400, "잘못된 파일 이름입니다.")
        dest = _resolve_local(None, None, os.path.join(target, rel))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as out:
            while chunk := await uf.read(1 << 20):
                out.write(chunk)
        saved.append(dest)
    return {"ok": True, "saved": saved}


class LocalMkdir(BaseModel):
    root: str
    path: str


@app.post("/api/local/mkdir")
async def local_mkdir(body: LocalMkdir):
    real = _resolve_local(body.root, body.path)
    os.makedirs(real, exist_ok=True)
    return {"ok": True}


class LocalDelete(BaseModel):
    paths: list[str]


@app.post("/api/local/delete")
async def local_delete(body: LocalDelete):
    roots = {os.path.realpath(b) for b in settings.LOCAL_ROOTS.values()}
    for p in body.paths:
        real = _resolve_local(None, None, p)
        if real in roots:
            raise HTTPException(400, "최상위 폴더는 지울 수 없습니다.")
        if os.path.isdir(real):
            shutil.rmtree(real)
        elif os.path.exists(real):
            os.remove(real)
    return {"ok": True}


@app.get("/api/local/file")
async def local_file(path: str):
    real = _resolve_local(None, None, path)
    if not os.path.isfile(real):
        raise HTTPException(404, "파일이 없습니다.")
    return FileResponse(real, filename=os.path.basename(real))


# ======================================================================= 용량 확인
class SizeBody(BaseModel):
    paths: list[str]


@app.post("/api/fs/size")
async def fs_size(body: SizeBody):
    """폴더를 하나씩 조회해 전체 크기를 구한다 (최대 60초 / 폴더 1000개)."""
    started = time.time()
    total, files, queue, scanned = 0, 0, list(map(_abs, _clean_paths(body.paths))), 0
    while queue and scanned < 1000 and time.time() - started < 60:
        rc, out = await pcs.run(["ls", "-l", queue.pop(0)], timeout=60)
        scanned += 1
        cur = pcs.extract_current_dir(out)
        if cur is None:
            continue
        for it in pcs.parse_file_table(out, base=cur):
            if it["is_dir"]:
                queue.append(it["path"])
            else:
                total += it["size"]
                files += 1
    return {"total": total, "files": files, "dirs": scanned, "complete": not queue}


@app.get("/api/local/disk")
async def local_disk(path: str = ""):
    real = _resolve_local(None, None, path or settings.DOWNLOAD_DIR)
    while not os.path.isdir(real):
        real = os.path.dirname(real)
    u = shutil.disk_usage(real)
    return {"path": real, "total": u.total, "used": u.used, "free": u.free, "min_free": settings.MIN_FREE_BYTES}


# ======================================================================= 알림
@app.get("/api/notify")
async def notify_get():
    return notify.public()


@app.put("/api/notify")
async def notify_put(values: dict[str, Any]):
    return notify.public(notify.update(values))


@app.post("/api/notify/test")
async def notify_test():
    cfg = notify.load()
    res = await notify.send("🔔 baidupcs-webui 알림 테스트입니다. 이 메시지가 보이면 설정이 맞습니다.", "test", cfg=cfg)
    if not res:
        raise HTTPException(400, "설정된 알림 채널이 없습니다. 먼저 저장하세요.")
    return {"results": res}


# ======================================================================= 설정
@app.get("/api/config")
async def config_get():
    cfg = await pcs.read_config_safe()
    return {"schema": pcs.CONFIG_SCHEMA, "values": pcs.config_values(cfg)}


class ConfigBody(BaseModel):
    values: dict[str, Any]


@app.put("/api/config")
async def config_put(body: ConfigBody):
    schema = {f["key"]: f for f in pcs.CONFIG_SCHEMA}
    flags, direct = [], {}
    for key, value in body.values.items():
        f = schema.get(key)
        if not f:
            continue
        if f["flag"] is None:
            direct[key] = value in (True, "true", "1", 1, "on")
        else:
            if f["type"] in ("size", "rate") and str(value).strip() == "":
                value = "0"
            flags.append(f"--{f['flag']}={pcs.to_flag_value(f, value)}")
    out = ""
    ok = True
    if flags:
        rc, out = await pcs.run(["config", "set", *flags], timeout=30)
        ok = "保存配置成功" in out
    if direct and ok:
        async with pcs.pcs_lock:
            cfg = pcs.read_config()
            cfg.update(direct)
            pcs.write_config_atomic(cfg)
    if not ok:
        # 오류 메시지만 추린다
        err = [l for l in out.splitlines() if "错误" in l or "error" in l.lower() or "不合法" in l]
        out = "\n".join(err) or out
    cfg = await pcs.read_config_safe()
    return {"ok": ok, "output": out if not ok else "", "values": pcs.config_values(cfg)}


@app.get("/api/config/raw")
async def config_raw():
    rc, out = await pcs.run(["config"], timeout=30)
    return _ok(rc, out)


# ======================================================================= 임의 명령 실행
class ExecBody(BaseModel):
    command: str
    stdin: str | None = None


@app.post("/api/exec")
async def exec_command(body: ExecBody):
    cmd = body.command.strip()
    if cmd.lower().startswith("baidupcs-go"):
        cmd = cmd[len("baidupcs-go"):].strip()
    try:
        args = shlex.split(cmd)
    except ValueError as e:
        raise HTTPException(400, f"명령을 해석할 수 없습니다: {e}")
    if not args:
        raise HTTPException(400, "명령을 입력하세요.")
    if args[0] in ("download", "d", "upload", "u"):
        # 긴 작업은 작업 관리자로 보낸다
        kind = "download" if args[0] in ("download", "d") else "upload"
        acct = await _account_meta()
        meta = {**acct}
        if kind == "download":
            meta["saveto"] = pcs.read_config().get("savedir") or settings.DOWNLOAD_DIR
        t = manager.add(kind, "명령: " + " ".join(args[1:])[:80], ["download" if kind == "download" else "upload", *args[1:]], meta)
        return {"ok": True, "output": f"작업 목록에 추가했습니다. (작업 ID {t.id})", "task": t.to_dict()}
    started = time.time()
    rc, out = await pcs.run(args, stdin_data=body.stdin)
    return {"ok": rc == 0, "returncode": rc, "output": out, "elapsed": round(time.time() - started, 2)}


@app.get("/api/help")
async def help_text(command: str = ""):
    args = shlex.split(command) + ["--help"] if command else ["--help"]
    rc, out = await pcs.run(args, timeout=15)
    return _ok(0, out)


# ======================================================================= 터미널
@app.websocket("/ws/terminal")
async def ws_terminal(ws: WebSocket):
    if not _authed(ws.cookies.get(SESSION_COOKIE)):
        await ws.close(code=4401)
        return
    await terminal_session(ws)


# ======================================================================= 정적 파일 (SPA)
app.mount("/static", StaticFiles(directory=settings.STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(os.path.join(settings.STATIC_DIR, "index.html"),
                        headers={"Cache-Control": "no-cache"})
