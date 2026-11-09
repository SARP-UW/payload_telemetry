"""Connection Registry: one bounded send queue per connected client."""

import asyncio

QUEUE_MAXSIZE = 64  # per-client buffer; when full, the oldest message is dropped


class ConnectionRegistry:
    def __init__(self, maxsize: int = QUEUE_MAXSIZE):
        self._maxsize = maxsize
        self._queues: set[asyncio.Queue] = set()

    def register(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._maxsize)
        self._queues.add(q)
        return q

    def unregister(self, q: asyncio.Queue) -> None:
        self._queues.discard(q)

    def broadcast(self, msg: dict) -> None:
        """Queue msg for every client without waiting, so a slow client can't stall the rest."""
        for q in list(self._queues):
            if q.full():
                q.get_nowait()  # drop this client's oldest message
            q.put_nowait(msg)

    def __len__(self) -> int:
        return len(self._queues)
