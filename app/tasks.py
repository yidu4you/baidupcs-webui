"""장시간 실행 작업(다운로드/업로드/전송 후 다운로드) 관리자.

각 작업은 별도의 BaiduPCS-Go 프로세스로 실행되며, 표준 출력을 실시간으로 파싱해
파일별 진행률을 추적한다. 상태는 /config/webui/tasks.json 에 저장되어
컨테이너가 재시작되어도 기록과 재시도가 가능하다.
"""
from __future__ import annotations

import asyncio
import codecs
import json
import os
import re
import signal
import time
import uuid
from collections import deque
from typing import Any

from . import pcs, settings

STORE = os.path.join(settings.WEBUI_DIR, "tasks.json")
LOG_LINES = 400

RE_PROGRESS = re.compile(r"\[(\d+)\]\s*([↓↑])\s*(\S+)/(\S+)\s+(\S+)/s\s+in\s+(\S+?)(?:,\s*left\s+(\S+))?\s*\.*$")
RE_QUEUED = re.compile(r"\[(\d+)\]\s*加入(下载|上传)队列:\s*(.+)$")
RE_PREPARE = re.compile(r"\[(\d+)\]\s*准备(下载|上传):\s*(.+)$")
RE_SAVETO = re.compile(r"\[(\d+)\]\s*将会下载到路径:\s*(.+)$")
RE_DL_DONE = re.compile(r"\[(\d+)\]\s*下载完成, 保存位置:\s*(.+)$")
RE_UL_DONE = re.compile(r"\[(\d+)\]\s*(?:上传文件成功|秒传成功), 保存到网盘路径:\s*(.+)$")
RE_EXISTS = re.compile(r"\[(\d+)\]\s*(?:文件已经存在|目标文件.*已存在).*跳过")
RE_VERIFY_OK = re.compile(r"\[(\d+)\]\s*检验文件有效性成功")
RE_VERIFYING = re.compile(r"\[(\d+)\]\s*开始检验文件有效性")
RE_RETRY = re.compile(r"\[(\d+)\]\s*(.+?),\s*重试\s*(\d+)/(\d+)")
RE_SUB = re.compile(r"\[(\d+)\]\s*(.+)$")
RE_END = re.compile(r"(下载|上传)结束, 时间:\s*([^,]+), (?:数据总量|总大小):\s*(\S+)")
RE_FAILED_HDR = re.compile(r"以下文件(下载|上传)失败")


def now() -> float:
    return time.time()


class Task:
    def __init__(self, kind: str, title: str, args: list[str], meta: dict | None = None, tid: str | None = None):
        self.id = tid or uuid.uuid4().hex[:12]
        self.kind = kind            # download | upload | transfer
        self.title = title
        self.args = args
        self.meta = meta or {}
        self.status = "queued"      # queued | running | done | failed | stopped | interrupted
        self.created_at = now()
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self.returncode: int | None = None
        self.summary = ""
        self.error = ""
        self.files: dict[str, dict] = {}
        self.log: deque[str] = deque(maxlen=LOG_LINES)
        self.proc: asyncio.subprocess.Process | None = None
        self._stop_requested = False
        self._in_failed_list = False

    # ------------------------------------------------------------ 직렬화
    def to_dict(self, with_log: bool = False) -> dict:
        files = sorted(self.files.values(), key=lambda f: int(f["id"]) if f["id"].isdigit() else 0)
        total = sum(f["total"] for f in files)
        done = sum(f["done"] if f["state"] != "done" else f["total"] for f in files)
        speed = sum(f["speed"] for f in files if f["state"] == "running")
        d = {
            "id": self.id, "kind": self.kind, "title": self.title, "args": self.args, "meta": self.meta,
            "status": self.status, "created_at": self.created_at, "started_at": self.started_at,
            "finished_at": self.finished_at, "returncode": self.returncode,
            "summary": self.summary, "error": self.error, "files": files,
            "total": total, "done": done, "speed": speed,
            "count": len(files), "count_done": sum(1 for f in files if f["state"] in ("done", "skipped")),
        }
        if with_log:
            d["log"] = list(self.log)
        return d

    def persist_dict(self) -> dict:
        d = self.to_dict()
        d["log"] = list(self.log)[-100:]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Task":
        t = cls(d["kind"], d["title"], d["args"], d.get("meta"), d["id"])
        for k in ("status", "created_at", "started_at", "finished_at", "returncode", "summary", "error"):
            setattr(t, k, d.get(k))
        t.files = {f["id"]: f for f in d.get("files", [])}
        t.log.extend(d.get("log", []))
        if t.status in ("running", "queued"):
            t.status = "interrupted"
            for f in t.files.values():
                if f["state"] in ("running", "queued", "preparing", "verifying"):
                    f["state"] = "interrupted"
                    f["speed"] = 0
        return t

    # ------------------------------------------------------------ 파싱
    def _file(self, fid: str) -> dict:
        f = self.files.get(fid)
        if f is None:
            f = {"id": fid, "path": "", "save_path": "", "state": "queued", "done": 0, "total": 0,
                 "speed": 0, "elapsed": "", "left": "", "message": "", "progress_text": ""}
            self.files[fid] = f
        return f

    def feed_progress(self, line: str) -> bool:
        m = RE_PROGRESS.search(line)
        if not m:
            return False
        fid, _arrow, done, total, speed, elapsed, left = m.groups()
        f = self._file(fid)
        f["done"] = pcs.parse_size(done)
        f["total"] = pcs.parse_size(total) or f["total"]
        f["speed"] = pcs.parse_size(speed)
        f["elapsed"] = elapsed
        f["left"] = left or ""
        f["state"] = "running"
        f["progress_text"] = f"{done}/{total} {speed}/s"
        return True

    def feed_line(self, line: str) -> None:
        line = line.strip()
        if not line or set(line) <= {"-", "."}:
            return
        if self.feed_progress(line):
            return
        self.log.append(line)

        if RE_FAILED_HDR.search(line):
            self._in_failed_list = True
            return
        m = RE_END.search(line)
        if m:
            self.summary = f"소요 {m.group(2)}, 총 {m.group(3)}"
            return
        m = RE_QUEUED.search(line)
        if m:
            f = self._file(m.group(1))
            f["path"] = m.group(3).strip()
            return
        m = RE_PREPARE.search(line)
        if m:
            f = self._file(m.group(1))
            f["path"] = f["path"] or m.group(3).strip()
            f["state"] = "preparing"
            return
        m = RE_SAVETO.search(line)
        if m:
            self._file(m.group(1))["save_path"] = m.group(2).strip()
            return
        m = RE_DL_DONE.search(line) or RE_UL_DONE.search(line)
        if m:
            f = self._file(m.group(1))
            f["save_path"] = m.group(2).strip()
            f["state"] = "done"
            f["speed"] = 0
            if f["total"]:
                f["done"] = f["total"]
            return
        m = RE_EXISTS.search(line)
        if m:
            f = self._file(m.group(1))
            f["state"] = "skipped"
            f["message"] = "이미 있어서 건너뜀"
            f["speed"] = 0
            return
        m = RE_VERIFYING.search(line)
        if m:
            f = self._file(m.group(1))
            f["state"] = "verifying"
            f["speed"] = 0
            return
        m = RE_VERIFY_OK.search(line)
        if m:
            self._file(m.group(1))["message"] = "MD5 검증 완료"
            return
        m = RE_RETRY.search(line)
        if m:
            f = self._file(m.group(1))
            f["message"] = f"{m.group(2)} (재시도 {m.group(3)}/{m.group(4)})"
            return
        m = RE_SUB.match(line)
        if m and m.group(1) != "0" and m.group(1) in self.files:
            f = self.files[m.group(1)]
            msg = m.group(2)
            if f["state"] not in ("done", "skipped"):
                f["message"] = msg[:200]
                if any(k in msg for k in ("失败", "错误", "error", "Error")):
                    f["state"] = "failed"
                    f["speed"] = 0
            return
        if self._in_failed_list and line.startswith("/"):
            for f in self.files.values():
                if f["path"] == line and f["state"] != "done":
                    f["state"] = "failed"


class TaskManager:
    def __init__(self):
        self.tasks: dict[str, Task] = {}
        self._wakeup = asyncio.Event()
        self._last_save = 0.0
        self._runner: asyncio.Task | None = None
        self._load()

    # ------------------------------------------------------------ 저장
    def _load(self):
        try:
            with open(STORE, "r", encoding="utf-8") as f:
                for d in json.load(f):
                    t = Task.from_dict(d)
                    self.tasks[t.id] = t
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass

    def save(self, force: bool = False):
        if not force and now() - self._last_save < 3:
            return
        self._last_save = now()
        data = [t.persist_dict() for t in self.tasks.values()]
        tmp = STORE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, STORE)

    # ------------------------------------------------------------ 공개 API
    def start(self):
        if self._runner is None:
            self._runner = asyncio.create_task(self._scheduler())

    def list(self) -> list[dict]:
        return [t.to_dict() for t in sorted(self.tasks.values(), key=lambda t: t.created_at, reverse=True)]

    def get(self, tid: str) -> Task | None:
        return self.tasks.get(tid)

    def add(self, kind: str, title: str, args: list[str], meta: dict | None = None) -> Task:
        t = Task(kind, title, args, meta)
        self.tasks[t.id] = t
        self.save(force=True)
        self._wakeup.set()
        return t

    async def stop(self, tid: str) -> bool:
        t = self.tasks.get(tid)
        if not t:
            return False
        if t.status == "queued":
            t.status = "stopped"
            t.finished_at = now()
            self.save(force=True)
            return True
        if t.status == "running" and t.proc and t.proc.returncode is None:
            t._stop_requested = True
            try:
                t.proc.send_signal(signal.SIGINT)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(t.proc.wait(), 5)
            except asyncio.TimeoutError:
                t.proc.kill()
            return True
        return False

    def retry(self, tid: str) -> bool:
        t = self.tasks.get(tid)
        if not t or t.status in ("running", "queued"):
            return False
        t.status = "queued"
        t.returncode = None
        t.error = ""
        t.summary = ""
        t.started_at = None
        t.finished_at = None
        t._stop_requested = False
        t._in_failed_list = False
        for f in t.files.values():
            if f["state"] not in ("done", "skipped"):
                f["state"] = "queued"
                f["speed"] = 0
                f["message"] = ""
        t.log.append("---- 다시 시작 ----")
        self.save(force=True)
        self._wakeup.set()
        return True

    async def remove(self, tid: str) -> bool:
        t = self.tasks.get(tid)
        if not t:
            return False
        if t.status == "running":
            await self.stop(tid)
        self.tasks.pop(tid, None)
        self.save(force=True)
        return True

    def clear_finished(self) -> int:
        ids = [t.id for t in self.tasks.values() if t.status in ("done", "failed", "stopped", "interrupted")]
        for i in ids:
            self.tasks.pop(i, None)
        self.save(force=True)
        return len(ids)

    def running_count(self) -> int:
        return sum(1 for t in self.tasks.values() if t.status == "running")

    # ------------------------------------------------------------ 실행 루프
    async def _scheduler(self):
        while True:
            try:
                queued = sorted((t for t in self.tasks.values() if t.status == "queued"), key=lambda t: t.created_at)
                free = settings.MAX_CONCURRENT_TASKS - self.running_count()
                for t in queued[:max(0, free)]:
                    t.status = "running"
                    asyncio.create_task(self._run(t))
                self._wakeup.clear()
                try:
                    await asyncio.wait_for(self._wakeup.wait(), 2)
                except asyncio.TimeoutError:
                    pass
            except Exception as e:  # 스케줄러가 죽지 않도록
                print("scheduler error:", e)
                await asyncio.sleep(2)

    async def _run(self, t: Task):
        t.started_at = now()
        t.log.append("$ BaiduPCS-Go " + " ".join(_quote(a) for a in t.args))
        try:
            # 설정파일을 읽는 시작 구간만 잠금 (다른 명령이 설정을 쓰는 중이면 기다림)
            async with pcs.pcs_lock:
                if t.meta.get("pre_cd"):
                    proc = await asyncio.create_subprocess_exec(
                        settings.PCS_BIN, "cd", t.meta["pre_cd"],
                        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT, env=pcs.child_env(), cwd=settings.CONFIG_DIR)
                    out, _ = await proc.communicate()
                    t.log.append(pcs.clean(out.decode("utf-8", "replace")))
                t.proc = await asyncio.create_subprocess_exec(
                    settings.PCS_BIN, *t.args,
                    stdin=asyncio.subprocess.DEVNULL,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    env=pcs.child_env(),
                    cwd=settings.CONFIG_DIR,
                )
                await asyncio.sleep(1.0)
            decoder = codecs.getincrementaldecoder("utf-8")("replace")
            buf = ""
            assert t.proc.stdout is not None
            while True:
                chunk = await t.proc.stdout.read(4096)
                if not chunk:
                    break
                buf += pcs.ANSI_RE.sub("", decoder.decode(chunk))
                parts = re.split(r"[\r\n]", buf)
                buf = parts.pop()
                for p in parts:
                    t.feed_line(p)
                # 끝나지 않은 진행률 라인도 즉시 반영
                if buf:
                    t.feed_progress(buf.strip())
                self.save()
            if buf:
                t.feed_line(buf)
            t.returncode = await t.proc.wait()
        except Exception as e:
            t.error = str(e)
            t.returncode = -1
        finally:
            t.finished_at = now()
            t.proc = None
            for f in t.files.values():
                f["speed"] = 0
            if t._stop_requested:
                t.status = "stopped"
                for f in t.files.values():
                    if f["state"] in ("running", "preparing", "queued", "verifying"):
                        f["state"] = "stopped"
            else:
                failed = [f for f in t.files.values() if f["state"] == "failed"]
                pending = [f for f in t.files.values() if f["state"] not in ("done", "skipped", "failed")]
                if t.returncode not in (0, None) or failed:
                    t.status = "failed"
                elif not t.files and t.kind != "transfer":
                    # 아무 파일도 처리되지 않았으면 마지막 로그를 오류로 보여준다
                    t.status = "failed"
                    t.error = _last_meaningful(t.log)
                else:
                    t.status = "done"
                for f in pending:
                    f["state"] = "failed" if t.status == "failed" else f["state"]
                if t.status == "failed" and not t.error:
                    t.error = _last_meaningful(t.log)
            self.save(force=True)
            self._wakeup.set()


def _last_meaningful(log) -> str:
    for line in reversed(log):
        if line and not line.startswith("$") and not line.startswith("[0]"):
            return line[:300]
    return "출력 없이 종료되었습니다."


def _quote(a: str) -> str:
    return a if re.match(r"^[\w@%+=:,./-]+$", a) else "'" + a.replace("'", "'\\''") + "'"


manager = TaskManager()
