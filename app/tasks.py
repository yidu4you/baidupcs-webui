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
import shutil
import signal
import time
import uuid
from collections import deque
from typing import Any

from . import notify, pcs, settings

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
        self.phase = ""             # 여러 단계 작업(경유 모드)의 현재 단계 설명
        self.proc: asyncio.subprocess.Process | None = None
        self._stop_requested = False
        self._in_failed_list = False
        self._disk_full = False

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
            "summary": self.summary, "error": self.error, "files": files, "phase": self.phase,
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
        for k in ("status", "created_at", "started_at", "finished_at", "returncode", "summary", "error", "phase"):
            setattr(t, k, d.get(k))
        t.phase = t.phase or ""
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
        if t.kind == "relay" and t.status == "done":
            # 끝난 공유 링크 작업을 ‘다시 실행’ 하면 처음(링크 저장)부터 다시 한다
            for k in ("items", "item_info", "size"):
                t.meta.pop(k, None)
            t.meta["stage"] = "transfer"
            t.files.clear()
        t.status = "queued"
        t.returncode = None
        t.error = ""
        t.summary = ""
        t.started_at = None
        t.finished_at = None
        t._stop_requested = False
        t._in_failed_list = False
        t._disk_full = False
        t.phase = ""
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

    # ------------------------------------------------------------ 실행 환경
    async def _prepare_env(self, t: Task) -> tuple[dict, str]:
        """작업 전용 설정 폴더를 만들어, 작업을 만든 계정으로 실행되게 한다.

        BaiduPCS-Go 는 설정 파일의 baidu_active_uid 계정으로 동작한다. 전역 설정을 그대로 쓰면
        작업이 대기하는 동안 웹에서 계정을 바꿨을 때 다른 계정으로 실행된다. 그래서 작업마다
        설정 파일 복사본을 만들고 그 안의 활성 계정을 작업의 계정으로 고정한다.
        """
        async with pcs.pcs_lock:
            cfg = pcs.read_config()
        users = cfg.get("baidu_user_list") or []
        uid = str(t.meta.get("uid") or "")
        if uid:
            if not any(str(u.get("uid")) == uid for u in users):
                raise TaskError(f"이 작업을 만든 계정({t.meta.get('account') or uid})이 로그아웃되어 실행할 수 없습니다. "
                                "계정 화면에서 다시 로그인한 뒤 ‘이어받기’를 누르세요.")
            cfg["baidu_active_uid"] = int(uid)
        elif not cfg.get("baidu_active_uid"):
            raise TaskError("로그인한 바이두 계정이 없습니다.")
        run_dir = os.path.join(settings.RUN_DIR, t.id)
        os.makedirs(run_dir, exist_ok=True)
        path = os.path.join(run_dir, "pcs_config.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False)
        os.chmod(path, 0o600)
        env = pcs.child_env()
        env["BAIDUPCS_GO_CONFIG_DIR"] = run_dir
        return env, run_dir

    async def _exec(self, t: Task, args: list[str], env: dict, *, feed: bool = True,
                    watch_dir: str | None = None, log_cmd: bool = True) -> tuple[int, str]:
        """BaiduPCS-Go 한 번 실행. 출력을 실시간으로 작업에 반영하고 (returncode, 출력) 을 돌려준다."""
        if t._stop_requested:
            return -2, ""
        if log_cmd:
            t.log.append("$ BaiduPCS-Go " + " ".join(_quote(a) for a in args))
        t.proc = await asyncio.create_subprocess_exec(
            settings.PCS_BIN, *args,
            stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, env=env, cwd=env["BAIDUPCS_GO_CONFIG_DIR"],
        )
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        buf, captured = "", []
        last_disk_check = 0.0
        assert t.proc.stdout is not None
        while True:
            chunk = await t.proc.stdout.read(4096)
            if not chunk:
                break
            text = pcs.ANSI_RE.sub("", decoder.decode(chunk))
            captured.append(text)
            if feed:
                buf += text
                parts = re.split(r"[\r\n]", buf)
                buf = parts.pop()
                for p in parts:
                    t.feed_line(p)
                if buf:
                    t.feed_progress(buf.strip())
            # 다운로드 중 NAS 여유 공간 감시
            if watch_dir and settings.MIN_FREE_BYTES and now() - last_disk_check > 10:
                last_disk_check = now()
                try:
                    free = shutil.disk_usage(watch_dir).free
                except OSError:
                    free = None
                if free is not None and free < settings.MIN_FREE_BYTES and t.proc.returncode is None:
                    t._disk_full = True
                    t.error = (f"NAS 여유 공간이 {pcs.human_size(free)} 남아 다운로드를 멈췄습니다 "
                               f"(기준 {pcs.human_size(settings.MIN_FREE_BYTES)}). 공간을 비운 뒤 ‘이어받기’를 누르세요.")
                    try:
                        t.proc.send_signal(signal.SIGINT)
                    except ProcessLookupError:
                        pass
            self.save()
        if feed and buf:
            t.feed_line(buf)
        rc = await t.proc.wait()
        t.proc = None
        return rc, pcs.clean("".join(captured))

    async def _list_dir(self, t: Task, env: dict, path: str) -> list[dict] | None:
        rc, out = await self._exec(t, ["ls", "-l", path], env, feed=False, log_cmd=False)
        cur = pcs.extract_current_dir(out)
        if cur is None:
            return None
        return pcs.parse_file_table(out, base=cur)

    async def _tree_size(self, t: Task, env: dict, paths: list[str], max_dirs: int = 2000) -> tuple[int, int, bool]:
        """폴더를 하나씩 조회해 전체 크기를 구한다. (크기, 파일 수, 끝까지 셌는지)"""
        total, count, queue, scanned = 0, 0, list(paths), 0
        while queue and scanned < max_dirs and not t._stop_requested:
            items = await self._list_dir(t, env, queue.pop(0))
            scanned += 1
            for it in items or []:
                if it["is_dir"]:
                    queue.append(it["path"])
                else:
                    total += it["size"]
                    count += 1
        return total, count, not queue

    # ------------------------------------------------------------ 실행
    async def _run(self, t: Task):
        t.started_at = now()
        run_dir = None
        try:
            env, run_dir = await self._prepare_env(t)
            if t.meta.get("account"):
                t.log.append(f"계정: {t.meta['account']} (uid {t.meta.get('uid')})")
            if t.kind == "relay":
                await self._run_relay(t, env)
            else:
                if t.meta.get("pre_cd"):
                    await self._exec(t, ["cd", t.meta["pre_cd"]], env, feed=False)
                watch = t.meta.get("saveto") if t.kind in ("download", "transfer") else None
                t.returncode, _ = await self._exec(t, t.args, env, watch_dir=watch)
        except TaskError as e:
            t.error = str(e)
            t.returncode = -1
        except Exception as e:
            t.error = f"{type(e).__name__}: {e}"
            t.returncode = -1
        finally:
            t.finished_at = now()
            t.proc = None
            for f in t.files.values():
                f["speed"] = 0
            if t._stop_requested and not t._disk_full:
                t.status = "stopped"
                for f in t.files.values():
                    if f["state"] in ("running", "preparing", "queued", "verifying"):
                        f["state"] = "stopped"
            else:
                failed = [f for f in t.files.values() if f["state"] == "failed"]
                pending = [f for f in t.files.values() if f["state"] not in ("done", "skipped", "failed")]
                if t._disk_full or t.returncode not in (0, None) or failed:
                    t.status = "failed"
                elif not t.files and t.kind not in ("transfer", "relay"):
                    # 아무 파일도 처리되지 않았으면 마지막 로그를 오류로 보여준다
                    t.status = "failed"
                    t.error = _last_meaningful(t.log)
                else:
                    t.status = "done"
                for f in pending:
                    if t.status == "failed":
                        f["state"] = "stopped" if t._disk_full else "failed"
                if t.status == "failed" and not t.error:
                    t.error = _last_meaningful(t.log)
            if t.status == "done":
                t.phase = ""
            if run_dir:
                shutil.rmtree(run_dir, ignore_errors=True)
            self.save(force=True)
            self._wakeup.set()
            if t.status in ("done", "failed"):
                asyncio.create_task(notify.notify_task(t))

    async def _run_relay(self, t: Task, env: dict):
        """공유 링크 → 넷디스크 저장 → NAS 다운로드 → (경유 모드면) 넷디스크·휴지통에서 삭제.

        단계는 meta["stage"] 에 저장되어, 실패 후 ‘이어받기’를 누르면 실패한 단계부터 다시 한다.
        """
        m = t.meta
        relay = m.get("delete_after", False)
        steps = 3 if relay else 2
        netdir = m["netdisk_dir"]
        saveto = m["saveto"]

        # 1) 공유 링크 저장
        if m.get("stage", "transfer") == "transfer":
            t.phase = f"1/{steps} 넷디스크에 저장 중"
            self.save(force=True)
            await self._exec(t, ["mkdir", netdir], env, feed=False)
            before = await self._list_dir(t, env, netdir)
            if before is None:
                raise TaskError(f"넷디스크 폴더 {netdir} 를 열 수 없습니다.")
            before_names = {i["name"] for i in before}
            await self._exec(t, ["cd", netdir], env, feed=False)
            targs = ["transfer"] + (["--collect"] if m.get("collect") else []) + (["--rname"] if m.get("rname") else [])
            if m.get("fs_id"):
                targs.append(f"--fs_id={m['fs_id']}")
            targs.append(m["link"])
            if m.get("code"):
                targs.append(m["code"])
            rc, out = await self._exec(t, targs, env, feed=False)
            for line in out.splitlines():
                if line.strip():
                    t.log.append(line.strip())
            if t._stop_requested:
                return
            if "成功" not in out:
                hint = " 넷디스크 용량이 부족한 것 같습니다. 휴지통을 비우거나 공간을 확보하세요." if "空间" in out or "容量" in out else ""
                raise TaskError("공유 링크 저장에 실패했습니다: " + _last_meaningful(t.log) + hint)
            after = await self._list_dir(t, env, netdir) or []
            new_items = [i for i in after if i["name"] not in before_names]
            if not new_items:
                raise TaskError("저장은 성공했다고 나왔지만 새로 생긴 파일을 찾지 못했습니다. 같은 이름의 파일이 이미 있는지 확인하세요.")
            m["items"] = [i["path"] for i in new_items]
            m["item_info"] = [{"path": i["path"], "is_dir": i["is_dir"], "size": i["size"]} for i in new_items]
            first = new_items[0]["name"]
            t.title = first + (f" 외 {len(new_items) - 1}개" if len(new_items) > 1 else "")
            m["stage"] = "download"
            self.save(force=True)

        # 2) NAS 로 다운로드
        if m.get("stage") == "download":
            t.phase = f"2/{steps} 필요한 공간 확인 중"
            self.save(force=True)
            items = m.get("items") or []
            if not items:
                raise TaskError("다운로드할 항목이 없습니다.")
            info = m.get("item_info")
            if not info:
                listing = await self._list_dir(t, env, netdir) or []
                by_path = {i["path"]: i for i in listing}
                info = [by_path.get(p, {"path": p, "is_dir": True, "size": 0}) for p in items]
            total = sum(i["size"] for i in info if not i["is_dir"])
            sub_total, _, complete = await self._tree_size(t, env, [i["path"] for i in info if i["is_dir"]])
            total += sub_total
            os.makedirs(saveto, exist_ok=True)
            free = shutil.disk_usage(saveto).free
            m["size"] = total
            t.log.append(f"필요한 공간 약 {pcs.human_size(total)}{'' if complete else ' 이상'}, NAS 여유 {pcs.human_size(free)}")
            if total and total > free - settings.MIN_FREE_BYTES:
                raise TaskError(f"NAS 공간이 부족합니다. 필요 {pcs.human_size(total)}, 여유 {pcs.human_size(free)}"
                                f" (최소 여유 {pcs.human_size(settings.MIN_FREE_BYTES)} 유지). 넷디스크의 파일은 그대로 두었으니 "
                                "공간을 비운 뒤 ‘이어받기’를 누르세요.")
            if t._stop_requested:
                return
            t.phase = f"2/{steps} NAS 로 다운로드 중"
            self.save(force=True)
            rc, _ = await self._exec(t, ["download", *m.get("dl_flags", []), f"--saveto={saveto}", *items], env, watch_dir=saveto)
            t.returncode = rc
            if t._stop_requested or rc != 0 or t._disk_full or any(f["state"] == "failed" for f in t.files.values()):
                if not t.error and not t._stop_requested:
                    t.error = "다운로드에 실패한 파일이 있습니다. 넷디스크의 파일은 그대로 두었으니 ‘이어받기’로 다시 받을 수 있습니다."
                if not t.returncode:
                    t.returncode = 1
                return
            m["stage"] = "cleanup" if relay else "done"
            self.save(force=True)

        # 3) 경유 모드: 넷디스크와 휴지통에서 정리
        if m.get("stage") == "cleanup":
            t.phase = f"3/{steps} 넷디스크에서 정리 중"
            self.save(force=True)
            rc, out = await self._exec(t, ["rm", netdir], env, feed=False)
            t.log.append(out.strip() or f"{netdir} 삭제")
            if m.get("purge_recycle", True):
                fsids = []
                for page in (1, 2, 3):
                    rc, out = await self._exec(t, ["recycle", "list", f"--page={page}"], env, feed=False, log_cmd=False)
                    rows = pcs.parse_recycle(out)
                    fsids += [r["fs_id"] for r in rows if r["path"] == netdir or r["path"].startswith(netdir + "/")]
                    if not rows:
                        break
                fsids = list(dict.fromkeys(fsids))   # 중복 제거
                if fsids:
                    rc, out = await self._exec(t, ["recycle", "delete", *fsids], env, feed=False)
                    t.log.append(out.strip() or "휴지통에서 삭제")
                else:
                    t.log.append("휴지통에서 해당 항목을 찾지 못했습니다 (이미 비워졌을 수 있음).")
            m["stage"] = "done"
            t.returncode = 0
            self.save(force=True)

        if m.get("stage") == "done":
            t.returncode = 0


class TaskError(Exception):
    """사용자에게 그대로 보여줄 작업 실패 사유."""


def _last_meaningful(log) -> str:
    for line in reversed(log):
        if line and not line.startswith("$") and not line.startswith("[0]"):
            return line[:300]
    return "출력 없이 종료되었습니다."


def _quote(a: str) -> str:
    return a if re.match(r"^[\w@%+=:,./-]+$", a) else "'" + a.replace("'", "'\\''") + "'"


manager = TaskManager()
