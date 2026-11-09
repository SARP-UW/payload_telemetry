"""Ground station WebSocket server: Data Packager + Connection Registry + Broadcast.

Run from repo root:
    uvicorn ground_station_software.src.server.sockets.app:app --port 8000

Endpoint: /ws [port TBD]. Message formats are PROVISIONAL (see packager.py,
commands.py). Until the serial path is wired in, data comes from MockSource.

Integration point for the main loop: app.state.publish(StructuredPacket). It is
safe to call from any thread and returns once the packet is handed to the
server's event loop for broadcast (the "completion signal" is "queued", not
"received by a browser").
"""

import asyncio
import contextlib
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from ground_station_software.src.server.sockets.commands import handle_request
from ground_station_software.src.server.sockets.config import CONFIG_DIR, load_slot_configs, resolve_slot_map
from ground_station_software.src.server.sockets.packager import DataPackager
from ground_station_software.src.server.sockets.registry import ConnectionRegistry
from ground_station_software.src.server.sockets.sources import MockSource
from ground_station_software.src.server.sockets.structured import StructuredPacket

logger = logging.getLogger("uvicorn.error")

Publish = Callable[[StructuredPacket], None]


def create_app(
    config_dir: Path = CONFIG_DIR,
    source_factory: Callable[[Publish], MockSource] | None = MockSource,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configs = load_slot_configs(config_dir)
        app.state.slot_configs = configs
        app.state.packager = DataPackager(resolve_slot_map(configs))
        app.state.registry = ConnectionRegistry()
        loop = asyncio.get_running_loop()

        def publish_now(pkt: StructuredPacket) -> None:
            msg = app.state.packager.package(pkt)
            if msg is not None:
                app.state.registry.broadcast(msg)

        def publish(pkt: StructuredPacket) -> None:
            try:
                running = asyncio.get_running_loop()
            except RuntimeError:
                running = None
            if running is loop:
                publish_now(pkt)
            else:
                loop.call_soon_threadsafe(publish_now, pkt)

        app.state.publish = publish

        task = asyncio.create_task(source_factory(publish).run()) if source_factory else None
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(lifespan=lifespan)

    @app.websocket("/ws")
    async def telemetry_ws(ws: WebSocket) -> None:
        await ws.accept()
        state = ws.app.state
        # Register before sending config so nothing published meanwhile is missed.
        q = state.registry.register()
        send_lock = asyncio.Lock()  # sender and receiver share one socket
        sent = 0

        async def send(msg: dict) -> None:
            async with send_lock:
                await ws.send_json(msg)

        async def sender() -> None:
            nonlocal sent
            while True:
                await send(await q.get())
                sent += 1

        async def receiver() -> None:
            while True:
                message = await ws.receive()
                if message["type"] == "websocket.disconnect":
                    return
                raw = message.get("text")
                if raw is None:
                    raw = message.get("bytes")
                await send(handle_request(raw))

        tasks: set[asyncio.Task] = set()
        try:
            await send({"type": "config", "slots": state.slot_configs})  # PROVISIONAL
            tasks = {asyncio.create_task(sender()), asyncio.create_task(receiver())}
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for t in done:
                t.result()  # re-raise anything other than a clean disconnect
        except WebSocketDisconnect:
            pass
        finally:
            # Clean up before awaiting: if this handler is itself being cancelled, the await raises.
            state.registry.unregister(q)
            for t in tasks:
                t.cancel()
            logger.info("ws_server: client disconnected after %d messages", sent)
            if tasks:
                # Not gather(): it would re-raise a child's CancelledError in place of this task's own,
                # which the server's cancel scope then doesn't recognise and lets escape.
                await asyncio.wait(tasks)

    return app


app = create_app()
