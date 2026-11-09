"""Data sources that feed the server with StructuredPackets.

MockSource stands in for the serial ingestion -> Packet Parser path until it is
wired in. A real source calls the same publish() function.
"""

import asyncio
import dataclasses
import random
import time
from collections.abc import Callable

from ground_station_software.src.constants import Packet
from ground_station_software.src.server.sockets.structured import StructuredPacket

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
