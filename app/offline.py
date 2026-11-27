"""오프라인 다운로드(바이두 서버가 대신 받는 작업)가 끝나면 NAS 다운로드 작업을 자동으로 만든다."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import time

from . import notify, pcs, settings
from .tasks import manager

STORE = os.path.join(settings.WEBUI_DIR, "offline_watch.json")
CHECK_INTERVAL = int(os.environ.get("OFFLINE_CHECK_INTERVAL", "60"))
FAILED = {"系统错误", "资源不存在", "下载超时", "资源存在但下载失败", "存储空间不足", "任务取消", "已删除"}

_watch: dict[str, dict] = {}   # 오프라인 task_id → 감시 정보
_runner: asyncio.Task | None = None
_wakeup = asyncio.Event()


def _load():
    global _watch
    try:
        with open(STORE, "r", encoding="utf-8") as f:
            _watch = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        _watch = {}


def _save():
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_watch, f, ensure_ascii=False)
    os.replace(tmp, STORE)


def watched() -> dict[str, dict]:
    return {k: {"saveto": v["saveto"], "status": v.get("status", ""), "account": v.get("account", "")} for k, v in _watch.items()}


def add(task_id: str, info: dict):
    _watch[str(task_id)] = {**info, "added_at": time.time()}
    _save()
    _wakeup.set()


def remove(task_id: str) -> bool:
    if _watch.pop(str(task_id), None) is None:
        return False
    _save()
    return True


async def _list_for(uid: str) -> list[dict] | None:
    """해당 계정으로 offlinedl list 를 실행한다 (전역 계정과 무관하게)."""
    async with pcs.pcs_lock:
        cfg = pcs.read_config()
    if not any(str(u.get("uid")) == uid for u in cfg.get("baidu_user_list") or []):
        return None
    cfg["baidu_active_uid"] = int(uid)
    run_dir = os.path.join(settings.RUN_DIR, f"offline-{uid}")
    os.makedirs(run_dir, exist_ok=True)
    path = os.path.join(run_dir, "pcs_config.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False)
    os.chmod(path, 0o600)
    env = pcs.child_env()
    env["BAIDUPCS_GO_CONFIG_DIR"] = run_dir
    try:
        proc = await asyncio.create_subprocess_exec(
            settings.PCS_BIN, "offlinedl", "list", stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env, cwd=run_dir)
        out, _ = await asyncio.wait_for(proc.communicate(), 120)
    finally:
        shutil.rmtree(run_dir, ignore_errors=True)
    return pcs.parse_offline_list(pcs.clean(out.decode("utf-8", "replace")))


async def check_once() -> int:
    """감시 중인 작업을 확인하고, 끝난 것은 NAS 다운로드 작업으로 넘긴다. 만든 작업 수를 돌려준다."""
    created = 0
    by_uid: dict[str, list[str]] = {}
    for tid, w in _watch.items():
        by_uid.setdefault(str(w.get("uid", "")), []).append(tid)
    for uid, ids in by_uid.items():
        rows = await _list_for(uid) if uid else None
        if rows is None:
            for tid in ids:
                _watch[tid]["status"] = "계정이 로그아웃됨"
            continue
        info = {r["task_id"]: r for r in rows}
        for tid in ids:
            w, r = _watch[tid], info.get(tid)
            if not r:
                w["status"] = "목록에 없음"
                continue
            w["status"] = r["status_label"]
            if r["status"] == "下载成功":
                path = r["save_path"].rstrip("/") + "/" + r["name"] if r["name"] else r["save_path"]
                flags = [f"--saveto={w['saveto']}", *w.get("dl_flags", [])]
                meta = {"uid": w["uid"], "account": w.get("account", ""), "saveto": w["saveto"],
                        "paths": [path], "from_offline": tid}
                for k in ("extract", "extract_delete", "extract_password"):
                    if w.get(k):
                        meta[k] = w[k]
                os.makedirs(w["saveto"], exist_ok=True)
                manager.add("download", r["name"] or path, ["download", *flags, path], meta)
                _watch.pop(tid, None)
                created += 1
            elif r["status"] in FAILED:
                _watch.pop(tid, None)
                await notify.send(f"❌ 오프라인 다운로드 실패: {r['name'] or r['url']}\n상태: {r['status_label']}", "offline_failed",
                                  {"offline": {"task_id": tid, "status": r["status"]}})
    _save()
    return created


async def _loop():
    while True:
        try:
            if _watch:
                await check_once()
        except Exception as e:
            print("offline watch error:", e)
        _wakeup.clear()
        try:
            await asyncio.wait_for(_wakeup.wait(), CHECK_INTERVAL)
        except asyncio.TimeoutError:
            pass


def start():
    global _runner
    _load()
    if _runner is None:
        _runner = asyncio.create_task(_loop())
