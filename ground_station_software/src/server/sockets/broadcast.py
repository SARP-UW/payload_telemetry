"""Fan-out hub between the telemetry reader and connected clients.

Holds one bounded queue per client. Publishing never blocks and never
raises, so a slow or disconnected browser cannot stall the serial reader
or the database writer.

Transport agnostic on purpose. This module knows nothing about FastAPI,
WebSockets, or JSON encoding. It moves dicts into queues. The server
module owns the actual sending.
"""

import asyncio
import logging

log = logging.getLogger(__name__)

#* messages held per client before the oldest is discarded.
#* sized so a client stalled for a few seconds recovers with recent data
#* rather than replaying a long backlog.
DEFAULT_QUEUE_SIZE = 100


class Subscriber:
    """A single connected client and its pending message queue.

    Args:
        queue_size (int, optional): Maximum queued messages before the
            oldest is dropped. Defaults to DEFAULT_QUEUE_SIZE.
    """

    def __init__(self, queue_size: int = DEFAULT_QUEUE_SIZE):
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=queue_size)
        self.dropped: int = 0

    def offer(self, message: dict):
        """Queues a message, discarding the oldest if the queue is full.

        Args:
            message (dict): Message to queue for this client
        """

        try:
            self.queue.put_nowait(message)
        except asyncio.QueueFull:
            #* drop the oldest so the client resumes on recent data
            #* rather than replaying stale history
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except asyncio.QueueEmpty:
                pass

            self.dropped += 1

            try:
                self.queue.put_nowait(message)
            except asyncio.QueueFull:
                #* lost a race with the consumer, drop this message
                pass

    async def get(self) -> dict:
        """Waits for the next message queued for this client.

        Returns:
            dict: Next pending message
        """

        return await self.queue.get()


class BroadcastHub:
    """Tracks connected clients and distributes messages to all of them."""

    def __init__(self, queue_size: int = DEFAULT_QUEUE_SIZE):
        self._subscribers: set[Subscriber] = set()
        self._queue_size = queue_size

    def register(self) -> Subscriber:
        """Adds a new client and returns its subscriber handle.

        Returns:
            Subscriber: Handle the caller reads messages from
        """

        sub = Subscriber(self._queue_size)
        self._subscribers.add(sub)

        log.info("Client connected, %d total", len(self._subscribers))

        return sub

    def unregister(self, sub: Subscriber):
        """Removes a client. Safe to call more than once.

        Args:
            sub (Subscriber): Handle returned by register()
        """

        self._subscribers.discard(sub)

        log.info(
            "Client disconnected, %d total, %d messages dropped",
            len(self._subscribers),
            sub.dropped,
        )

    def publish(self, message: dict):
        """Offers a message to every connected client.

        Never blocks and never raises. Zero connected clients is a normal
        state, not an error, so logging continues during a range test
        with no browser open.

        Args:
            message (dict): Message to distribute
        """

        #! iterate a copy. a client can unregister mid-publish.
        for sub in list(self._subscribers):
            sub.offer(message)

    @property
    def client_count(self) -> int:
        """Number of currently connected clients.

        Returns:
            int: Connected client count
        """

        return len(self._subscribers)