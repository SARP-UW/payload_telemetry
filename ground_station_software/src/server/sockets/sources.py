"""Data sources that feed the server with StructuredPackets.

MockSource generates fake data. SerialSource reads the serial port through the
serial ingestion -> Packet Parser path. Both call the same publish() function.
Which one the server runs is chosen by environment variables (source_factory_from_env).
"""

import asyncio
import dataclasses
import logging
import os
import random
import threading
import time
from collections.abc import Callable, Mapping
from typing import Protocol

from ground_station_software.src.constants import Packet
from ground_station_software.src.server.sockets.structured import StructuredPacket

logger = logging.getLogger("uvicorn.error")

Publish = Callable[[StructuredPacket], None]


class Source(Protocol):
    async def run(self) -> None: ...


SEND_HZ = 10.0  # per peripheral [confirm packet rate with Christian]
DROP_PROB = 0.0  # chance a packet is "lost" before the server; its src_seq is still used up

GPS_PERIPHERAL = 0
USER_PERIPHERALS = (1, 2)

# Reserved (GPS) fields come from the Packet dataclass.
PACKET_FIELDS = dataclasses.fields(Packet)
_FIELD_NAMES = {f.name for f in PACKET_FIELDS}

TIME_FIELD = "utc_time"  # filled with wall-clock time (display only)
ID_FIELD = "packet_id"  # 2-byte unsigned counter in the real packet
assert TIME_FIELD in _FIELD_NAMES, f"Packet has no {TIME_FIELD!r} field"
assert ID_FIELD in _FIELD_NAMES, f"Packet has no {ID_FIELD!r} field"

# User1/User2 peripheral packets aren't defined yet.
PLACEHOLDER_FIELDS = ["[field_1]", "[field_2]"]  # [confirm peripheral packet structure with Christian/Thomas]

# Dev-only signal shapes, applied to every walked field regardless of name.
# [confirm ranges with firmware]
WALK_MIN = 0.0
WALK_MAX = 100.0
WALK_STEP = 1.0


class BoundedWalk:
    """Gaussian random walk that reflects off [lo, hi]."""

    def __init__(self, lo: float, hi: float, step: float, as_int: bool = False):
        self.lo = lo
        self.hi = hi
        self.step_size = step
        self.as_int = as_int
        self.value = random.uniform(lo, hi)

    def step(self) -> float | int:
        v = self.value + random.gauss(0.0, self.step_size)
        if v > self.hi:
            v = 2 * self.hi - v
        if v < self.lo:
            v = 2 * self.lo - v
        self.value = min(max(v, self.lo), self.hi)
        if self.as_int:
            return max(0, int(round(self.value)))
        return self.value


def make_walks() -> dict[str, BoundedWalk]:
    return {
        f.name: BoundedWalk(WALK_MIN, WALK_MAX, WALK_STEP, as_int=f.type is int)
        for f in PACKET_FIELDS
        if f.name not in (TIME_FIELD, ID_FIELD)
    }


class MockSource:
    """Publishes packets for peripherals 0, 1 and 2 at SEND_HZ each."""

    def __init__(self, publish: Callable[[StructuredPacket], None]):
        self._publish = publish
        self._gps_walks = make_walks()
        self._user_walks = {
            pid: {name: BoundedWalk(WALK_MIN, WALK_MAX, WALK_STEP) for name in PLACEHOLDER_FIELDS}
            for pid in USER_PERIPHERALS
        }
        self._src_seq = {pid: 0 for pid in (GPS_PERIPHERAL, *USER_PERIPHERALS)}

    def _gps_fields(self, src_seq: int) -> dict[str, float | int]:
        fields: dict[str, float | int] = {}
        for f in PACKET_FIELDS:
            if f.name == ID_FIELD:
                fields[f.name] = src_seq & 0xFFFF
            elif f.name == TIME_FIELD:
                fields[f.name] = time.time()  # [confirm utc_time encoding with Christian]
            else:
                fields[f.name] = self._gps_walks[f.name].step()
        return fields

    def _emit(self, pid: int) -> None:
        src_seq = self._src_seq[pid]
        self._src_seq[pid] += 1
        if pid == GPS_PERIPHERAL:
            fields = self._gps_fields(src_seq)
        else:
            fields = {name: walk.step() for name, walk in self._user_walks[pid].items()}
        if random.random() >= DROP_PROB:
            self._publish(StructuredPacket(pid, fields, src_seq))

    async def run(self) -> None:
        deadline = time.monotonic()
        while True:
            for pid in self._src_seq:
                self._emit(pid)

            period = 1.0 / SEND_HZ
            deadline += period
            now = time.monotonic()
            if now - deadline > period:
                # More than one tick behind: resync instead of bursting to catch up.
                deadline = now
            await asyncio.sleep(max(0.0, deadline - now))


REOPEN_S = 2.0  # wait before retrying a port that failed to open or read [dev default]
BAD_LOG_EVERY = 100  # after the first bad frame, log every Nth so a noisy link doesn't flood the log


class SerialSource:
    """Reads frames from a serial port, parses them, and publishes the Reserved (GPS) packet.

    Uses Thomas's serial ingestion and Packet Parser as they are. Bad frames are
    counted and dropped; port errors close the port and retry. The blocking read
    loop runs in a worker thread (publish() is thread-safe).
    """

    def __init__(
        self,
        publish: Publish,
        port: str,
        baud: int | None = None,
        open_port: Callable[[], object] | None = None,
    ):
        # Imported here, not at module level, so the mock server runs without pyserial.
        # A missing dependency then fails at startup rather than inside the thread.
        from ground_station_software.src.server.drivers import bytestream, serial_ingestion
        from ground_station_software.src.server.parsers import packet_parser

        self._publish = publish
        self._port = port
        self._baud = baud
        self._bytestream = bytestream
        self._ingest = serial_ingestion
        self._parser = packet_parser
        self._open_port = open_port or self._open_real_port
        self._stop = threading.Event()
        self.good = 0  # frames published
        self.bad = 0  # frames dropped as invalid

    def _open_real_port(self) -> object:
        # Leave baud to RealSerial's default unless one was given [confirm baud with Christian].
        if self._baud is None:
            return self._bytestream.RealSerial(self._port)
        return self._bytestream.RealSerial(self._port, self._baud)

    async def run(self) -> None:
        try:
            await asyncio.to_thread(self.read_forever)
        finally:
            # On cancel the thread is still running; it exits within one read timeout.
            self.stop()

    def stop(self) -> None:
        self._stop.set()

    def read_forever(self) -> None:
        """Blocking read loop. Returns once stop() is called."""
        while not self._stop.is_set():
            try:
                port = self._open_port()
            except OSError as e:  # pyserial's SerialException is an OSError
                logger.warning("serial: could not open %s (%s); retrying in %.0fs", self._port, e, REOPEN_S)
                self._stop.wait(REOPEN_S)
                continue

            logger.info("serial: reading %s", self._port)
            try:
                while not self._stop.is_set():
                    self._read_one(port)
            except OSError as e:
                logger.warning("serial: read from %s failed (%s); reopening in %.0fs", self._port, e, REOPEN_S)
                self._stop.wait(REOPEN_S)
            finally:
                _close(port)

    def _read_one(self, port: object) -> None:
        try:
            raw = self._ingest.read_packet(port)
            if not raw:
                return  # read timed out with nothing on the line
            # read_packet returns frames that failed validation too, so check before parsing.
            self._ingest.validate_packet(raw)
            pkt = self._parser.parse_packet(raw)
            if pkt is None:
                raise ValueError("parser returned no packet")
            fields = dataclasses.asdict(pkt)
        except OSError:
            raise  # the port itself failed: let read_forever reopen it
        except Exception as e:
            self._drop(e)
            return

        self.good += 1
        # Every parsed frame is the Reserved packet for now [confirm peripheral id source with Thomas/Christian].
        self._publish(StructuredPacket(GPS_PERIPHERAL, fields, fields.get(ID_FIELD)))

    def _drop(self, err: Exception) -> None:
        self.bad += 1
        if self.bad == 1 or self.bad % BAD_LOG_EVERY == 0:
            logger.warning("serial: dropped bad frame (%d so far): %s: %s", self.bad, type(err).__name__, err)


def _close(port: object) -> None:
    # RealSerial keeps the pyserial object in .ser and has no close() of its own.
    inner = getattr(port, "ser", port)
    close = getattr(inner, "close", None)
    if close is not None:
        close()


def source_factory_from_env(env: Mapping[str, str] = os.environ) -> Callable[[Publish], Source]:
    """Pick the data source from environment variables.

    GS_SOURCE        mock (default) or serial
    GS_SERIAL_PORT   port name, required for serial (e.g. COM6)
    GS_SERIAL_BAUD   optional; RealSerial's default is used when unset
    """
    kind = env.get("GS_SOURCE", "mock").strip().lower()
    if kind == "mock":
        return MockSource
    if kind != "serial":
        raise ValueError(f"GS_SOURCE must be 'mock' or 'serial', not {kind!r}")

    port = env.get("GS_SERIAL_PORT", "").strip()
    if not port:
        raise ValueError("GS_SOURCE=serial needs GS_SERIAL_PORT (e.g. COM6)")
    baud_text = env.get("GS_SERIAL_BAUD", "").strip()
    try:
        baud = int(baud_text) if baud_text else None
    except ValueError:
        raise ValueError(f"GS_SERIAL_BAUD must be an integer, not {baud_text!r}") from None

    return lambda publish: SerialSource(publish, port, baud)
