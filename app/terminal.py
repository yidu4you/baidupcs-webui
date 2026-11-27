"""BaiduPCS-Go 대화형 모드를 PTY 로 띄워 WebSocket 으로 중계한다.

웹 화면에 없는 기능(대화식 login, su 선택, 자동완성 등)도 모두 여기서 쓸 수 있다.
"""
from __future__ import annotations

import asyncio
import fcntl
import json
import os
import pty
import signal
import struct
import termios

from fastapi import WebSocket, WebSocketDisconnect

from . import pcs, settings


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", max(rows, 2), max(cols, 10), 0, 0))


async def terminal_session(ws: WebSocket) -> None:
    await ws.accept()
    master, slave = pty.openpty()
    _set_winsize(master, 30, 100)
    env = pcs.child_env()
    env["TERM"] = "xterm-256color"
    # util-linux 의 `setsid -c` 로 새 세션을 만들고 PTY 를 제어 터미널로 지정한다
    # (Ctrl+C 등 시그널 전달용). preexec_fn 은 uvloop 에서 불안정해서 쓰지 않는다.
    proc = await asyncio.create_subprocess_exec(
        "setsid", "-c", settings.PCS_BIN,
        stdin=slave, stdout=slave, stderr=slave,
        env=env, cwd=settings.CONFIG_DIR,
    )
    os.close(slave)
    os.set_blocking(master, False)

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    def on_readable():
        try:
            data = os.read(master, 65536)
        except OSError:
            data = b""
        if data:
            queue.put_nowait(data)
        else:
            loop.remove_reader(master)
            queue.put_nowait(None)

    loop.add_reader(master, on_readable)

    async def pump_out():
        while True:
            data = await queue.get()
            if data is None:
                break
            await ws.send_bytes(data)
        try:
            await ws.send_text(json.dumps({"type": "exit"}))
        except Exception:
            pass

    async def pump_in():
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                os.write(master, msg["bytes"])
                continue
            text = msg.get("text")
            if not text:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError:
                os.write(master, text.encode())
                continue
            if obj.get("type") == "input":
                os.write(master, obj.get("data", "").encode())
            elif obj.get("type") == "resize":
                _set_winsize(master, int(obj.get("rows", 30)), int(obj.get("cols", 100)))
                try:
                    os.killpg(proc.pid, signal.SIGWINCH)
                except ProcessLookupError:
                    pass

    out_task = asyncio.create_task(pump_out())
    in_task = asyncio.create_task(pump_in())
    try:
        await asyncio.wait({out_task, in_task}, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        for t in (out_task, in_task):
            t.cancel()
        try:
            loop.remove_reader(master)
        except Exception:
            pass
        if proc.returncode is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), 3)
            except asyncio.TimeoutError:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        try:
            os.close(master)
        except OSError:
            pass
        try:
            await ws.close()
        except Exception:
            pass
