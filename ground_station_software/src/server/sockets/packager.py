"""Data Packager: tags each structured packet with its display slot and builds the JSON message."""

import logging
import time
from collections.abc import Callable

from ground_station_software.src.server.sockets.structured import StructuredPacket

logger = logging.getLogger("uvicorn.error")


class DataPackager:
    """Builds one telemetry message per packet. Owns the server-wide seq and clock."""

    def __init__(self, slot_map: dict[int, str], clock: Callable[[], float] = time.monotonic):
        self._slot_map = dict(slot_map)
        self._clock = clock
        self._t0 = clock()
        self.seq = 0
        self.unknown = 0  # packets dropped because their peripheral has no slot
        self._warned: set[int] = set()

    def package(self, pkt: StructuredPacket) -> dict | None:
        slot = self._slot_map.get(pkt.peripheral_id)
        if slot is None:
            self.unknown += 1
            if pkt.peripheral_id not in self._warned:
                self._warned.add(pkt.peripheral_id)
                logger.warning("packager: no slot for peripheral %s; dropping its packets", pkt.peripheral_id)
            return None

        msg = {
            "type": "telemetry",  # PROVISIONAL: pending backend contract
            "seq": self.seq,  # PROVISIONAL: server-wide, detects server -> browser drops
            "t_ms": int((self._clock() - self._t0) * 1000),  # PROVISIONAL: ms since server start
            "slot": slot,  # PROVISIONAL
            "peripheral_id": pkt.peripheral_id,  # PROVISIONAL
            "src_seq": pkt.src_seq,  # PROVISIONAL: per-source, detects drops before the server
            "data": dict(pkt.fields),
        }
        self.seq += 1
        return msg
