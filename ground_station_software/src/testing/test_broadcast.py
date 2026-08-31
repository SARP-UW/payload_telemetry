"""Manual checks for the broadcast hub. No hardware or server needed.

Run:
    python -m ground_station_software.src.testing.test_broadcast
"""

import asyncio

from ground_station_software.src.server.sockets.broadcast import BroadcastHub


async def main():
    hub = BroadcastHub(queue_size=3)

    #* two clients both receive a published message
    a = hub.register()
    b = hub.register()

    hub.publish({"type": "data", "n": 1})

    assert hub.client_count == 2
    assert (await a.get())["n"] == 1
    assert (await b.get())["n"] == 1
    print("both clients received the message")

    #* a full queue drops oldest on that client only, b is untouched
    for n in range(10):
        hub.publish({"type": "data", "n": n})

    #* b drained nothing, so b overflowed and a did too. drain a fully
    #* to prove it holds the three most recent, not the three oldest
    received = []
    while not a.queue.empty():
        received.append((await a.get())["n"])

    assert received == [7, 8, 9], received
    assert a.dropped == 7, a.dropped
    print(f"overflow kept newest: {received}, dropped {a.dropped}")

    #* one client leaving does not affect the other
    hub.unregister(a)
    hub.publish({"type": "data", "n": 99})

    assert hub.client_count == 1
    print("unregister left the remaining client working")

    #* zero clients is normal, not an error
    hub.unregister(b)
    hub.publish({"type": "data", "n": 100})

    assert hub.client_count == 0
    print("publish with no clients is a no-op")

    print("\nall checks passed")


if __name__ == "__main__":
    asyncio.run(main())