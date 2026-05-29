"""
server.py — reads validated packets from serial, stores them in SQLite,
and broadcasts JSON to all connected WebSocket clients.

Usage:
    pip install pyserial websockets
    python server.py                      # defaults: COM3, 9600, ws://localhost:8765
    python server.py --port /dev/ttyUSB0 --baud 115200 --ws-port 8765
"""
"""


import argparse
import asyncio
import json
import logging
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone

import serial
import websockets

from packet import Packet, PacketError, validate_and_parse

# ── Config ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("server")

DB_PATH  = "packets.db"
WS_HOST  = "localhost"


# ── Database ──────────────────────────────────────────────────────────────────

def init_db(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path, check_same_thread=False)
    con.execute(
        CREATE TABLE IF NOT EXISTS packets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at TEXT    NOT NULL,
            msg_id      INTEGER NOT NULL,
            temp_c      REAL,
            pressure_pa REAL,
            accel_x     REAL,
            accel_y     REAL,
            rpm         INTEGER,
            status      INTEGER
        )
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_received ON packets(received_at)")
    con.commit()
    log.info("Database ready at %s", db_path)
    return con


def store_packet(con: sqlite3.Connection, pkt: Packet, received_at: str) -> int:
    cur = con.execute(
        INSERT INTO packets
           (received_at, msg_id, temp_c, pressure_pa, accel_x, accel_y, rpm, status)
           VALUES (?,?,?,?,?,?,?,?),
        (received_at, pkt.msg_id, pkt.temp_c, pkt.pressure_pa,
         pkt.accel_x, pkt.accel_y, pkt.rpm, pkt.status),
    )
    con.commit()
    return cur.lastrowid


# ── WebSocket broadcast ───────────────────────────────────────────────────────

# Shared set of connected clients
_clients: set[websockets.WebSocketServerProtocol] = set()


async def ws_handler(ws: websockets.WebSocketServerProtocol, path: str):
    _clients.add(ws)
    log.info("Client connected: %s  (total: %d)", ws.remote_address, len(_clients))
    try:
        await ws.wait_closed()
    finally:
        _clients.discard(ws)
        log.info("Client disconnected. (total: %d)", len(_clients))


async def broadcast(message: str):
    if not _clients:
        return
    dead = set()
    for ws in _clients:
        try:
            await ws.send(message)
        except websockets.ConnectionClosed:
            dead.add(ws)
    _clients.difference_update(dead)


# ── Serial reader ─────────────────────────────────────────────────────────────

PACKET_LEN = 25   # must match packet.py

async def read_serial(port: str, baud: int, db: sqlite3.Connection):

    Reads raw bytes from the serial port, attempts to sync to 25-byte frames,
    validates each frame, stores it, and broadcasts JSON.

    loop = asyncio.get_event_loop()

    def open_serial():
        ser = serial.Serial(port, baud, timeout=1)
        time.sleep(2)          # let device settle
        ser.reset_input_buffer()
        return ser

    ser = await loop.run_in_executor(None, open_serial)
    log.info("Serial open: %s @ %d baud", port, baud)

    buf = bytearray()

    while True:
        # Read in a non-blocking chunk via executor so asyncio isn't stalled
        chunk = await loop.run_in_executor(None, lambda: ser.read(ser.in_waiting or 1))
        if not chunk:
            await asyncio.sleep(0.005)
            continue

        buf.extend(chunk)

        # Process all complete frames in the buffer
        while len(buf) >= PACKET_LEN:
            frame = bytes(buf[:PACKET_LEN])
            buf = buf[PACKET_LEN:]

            received_at = datetime.now(timezone.utc).isoformat()

            try:
                pkt = validate_and_parse(frame)
            except PacketError as exc:
                log.warning("Invalid packet (msg_id unknown): %s | raw=%s",
                            exc, frame.hex())
                continue

            row_id = store_packet(db, pkt, received_at)

            payload = {
                "db_id":       row_id,
                "received_at": received_at,
                **pkt.to_dict(),
            }
            log.debug("Packet #%d stored (db_id=%d)", pkt.msg_id, row_id)
            await broadcast(json.dumps(payload))


# ── Entry point ───────────────────────────────────────────────────────────────

async def main(serial_port: str, baud: int, ws_port: int):
    db = init_db(DB_PATH)

    ws_server = await websockets.serve(ws_handler, WS_HOST, ws_port)
    log.info("WebSocket server listening on ws://%s:%d", WS_HOST, ws_port)

    try:
        await read_serial(serial_port, baud, db)
    except KeyboardInterrupt:
        pass
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        db.close()
        log.info("Shutdown complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serial → SQLite → WebSocket bridge")
    parser.add_argument("--port",    default="COM3",   help="Serial port (e.g. /dev/ttyUSB0)")
    parser.add_argument("--baud",    type=int, default=9600)
    parser.add_argument("--ws-port", type=int, default=8765)
    args = parser.parse_args()

    asyncio.run(main(args.port, args.baud, args.ws_port))

"""