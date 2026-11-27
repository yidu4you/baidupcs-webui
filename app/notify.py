"""작업 완료·실패 알림 (텔레그램, 디스코드, 일반 웹훅)."""
from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from . import pcs, settings

STORE = os.path.join(settings.WEBUI_DIR, "notify.json")
MASK = "••••••"

DEFAULTS: dict[str, Any] = {
    "on_done": True,
    "on_fail": True,
    "telegram_token": "",
    "telegram_chat_id": "",
    "discord_webhook": "",
    "webhook_url": "",
}
SECRET_KEYS = ("telegram_token", "discord_webhook", "webhook_url")


def load() -> dict:
    try:
        with open(STORE, "r", encoding="utf-8") as f:
            return {**DEFAULTS, **json.load(f)}
    except (FileNotFoundError, json.JSONDecodeError):
        return dict(DEFAULTS)


def _mask(v: str) -> str:
    if not v:
        return ""
    return (v[:6] + MASK + v[-4:]) if len(v) > 14 else MASK


def public(cfg: dict | None = None) -> dict:
    cfg = cfg or load()
    out = {k: cfg.get(k, DEFAULTS[k]) for k in DEFAULTS}
    for k in SECRET_KEYS:
        out[k] = _mask(out[k])
    out["configured"] = bool((cfg["telegram_token"] and cfg["telegram_chat_id"]) or cfg["discord_webhook"] or cfg["webhook_url"])
    return out


def update(values: dict) -> dict:
    cfg = load()
    for k in DEFAULTS:
        if k not in values:
            continue
        v = values[k]
        if k in SECRET_KEYS and isinstance(v, str) and MASK in v:
            continue  # 가려진 값이 그대로 오면 기존 값 유지
        cfg[k] = bool(v) if isinstance(DEFAULTS[k], bool) else str(v or "").strip()
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False)
    os.chmod(tmp, 0o600)
    os.replace(tmp, STORE)
    return cfg


def _post(url: str, payload: dict) -> str:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type": "application/json", "User-Agent": "baidupcs-webui",
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return f"OK ({r.status})"
    except urllib.error.HTTPError as e:
        return f"실패 ({e.code}) {e.read()[:200].decode('utf-8', 'replace')}"
    except Exception as e:  # 네트워크 오류 등
        return f"실패: {e}"


async def send(text: str, event: str = "message", extra: dict | None = None, cfg: dict | None = None) -> dict:
    cfg = cfg or load()
    jobs = {}
    if cfg["telegram_token"] and cfg["telegram_chat_id"]:
        url = f"https://api.telegram.org/bot{cfg['telegram_token']}/sendMessage"
        jobs["telegram"] = asyncio.to_thread(_post, url, {"chat_id": cfg["telegram_chat_id"], "text": text, "disable_web_page_preview": True})
    if cfg["discord_webhook"]:
        jobs["discord"] = asyncio.to_thread(_post, cfg["discord_webhook"], {"content": text[:1900]})
    if cfg["webhook_url"]:
        jobs["webhook"] = asyncio.to_thread(_post, cfg["webhook_url"], {"event": event, "text": text, "time": int(time.time()), **(extra or {})})
    if not jobs:
        return {}
    results = await asyncio.gather(*jobs.values())
    return dict(zip(jobs.keys(), results))


KIND = {"download": "다운로드", "upload": "업로드", "transfer": "링크 저장", "relay": "공유 링크 받기"}


def _dur(sec: float) -> str:
    sec = int(max(0, sec))
    h, m = divmod(sec // 60, 60)
    return f"{h}시간 {m}분" if h else (f"{m}분 {sec % 60}초" if m else f"{sec}초")


async def notify_task(t) -> None:
    """작업이 끝났을 때 호출된다. 설정에 따라 알림을 보낸다."""
    cfg = load()
    ok = t.status == "done"
    if (ok and not cfg["on_done"]) or (not ok and not cfg["on_fail"]):
        return
    d = t.to_dict()
    head = ("✅ " if ok else "❌ ") + f"{KIND.get(t.kind, t.kind)} {'완료' if ok else '실패'}: {t.title}"
    lines = [head]
    if d["total"]:
        lines.append(f"{pcs.human_size(d['total'])} · 파일 {d['count_done']}/{d['count']}")
    if t.started_at and t.finished_at:
        lines.append(f"소요 {_dur(t.finished_at - t.started_at)}")
    if t.meta.get("account"):
        lines.append(f"계정 {t.meta['account']}")
    saveto = t.meta.get("saveto")
    if saveto:
        host = settings.HOST_DOWNLOAD_DIR
        if host and saveto.startswith(settings.DOWNLOAD_DIR):
            saveto = host + saveto[len(settings.DOWNLOAD_DIR):]
        lines.append(f"저장 {saveto}")
    if not ok and t.error:
        lines.append(f"오류: {t.error[:300]}")
    try:
        await send("\n".join(lines), "task_done" if ok else "task_failed",
                   {"task": {"id": t.id, "kind": t.kind, "title": t.title, "status": t.status}}, cfg)
    except Exception as e:
        print("notify error:", e)
