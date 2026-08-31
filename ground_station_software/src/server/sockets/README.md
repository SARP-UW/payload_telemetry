# WebSocket Layer

Streams live telemetry from the serial reader to browser clients.

## Message contract

All messages are JSON objects with a `type` field.

| type | when | purpose |
|---|---|---|
| `schema` | once, on connect | describes available fields so the client builds plots dynamically |
| `data` | per valid packet | field values plus a server receive timestamp |
| `status` | on state change | serial connection state, packet counters |

`schema` is generated from the `Packet` dataclass in `src/constants.py`.
Adding a field there propagates to the client with no frontend change.

## Open questions

Blocking implementation past Phase 2:

1. **Real on-wire frame size.** `constants.py` has `PACKET_LENGTH = 34`,
   `PAYLOAD_END = 36`, and the comment `#2 + 34 + 2` (= 38). `FORMAT`
   unpacks to exactly 34 bytes including the 2-byte header. As written,
   `validate_packet` reads the checksum at offset 36 of a 34-byte buffer,
   which raises an uncaught `struct.error`. Owner: firmware.

2. **Does the ground blackpill reframe packets or pass bytes through?**
   Decides whether Python sees clean frames or a raw stream needing
   resync. Owner: firmware.

3. **FastAPI or standalone `websockets`?** `dashboard.html` currently
   points at `ws://localhost:8765` (standalone). Architecture doc says
   FastAPI. Recommend FastAPI: one port for HTML, REST, and WS.
   Owner: ground station software.

Blocking the schema message specifically:

4. **Is `packet_id` a sequence counter or a message type ID?**
   If sequence counter, the client can detect dropped packets from gaps.
   If message type ID, there are multiple packet layouts and `schema`
   must be a map of ID to field list rather than a flat list.
   Owner: firmware.

5. **Units for each field.** Marked `[confirm]` in `schema.py`.
   Needed for axis labels. Owner: firmware.

6. **What does `utc_time` represent?** Declared as a 4-byte float.
   float32 holds ~7 significant digits. Unix epoch needs 10, so a
   float32 can only resolve epoch time to roughly 128 seconds. If it is
   epoch, the field needs to be a double or uint32. If it is
   seconds-since-midnight (0 to 86400), float32 gives ~8 ms and is fine.
   Owner: firmware.

## Out of scope this pass

Command uplink. The onboard flowchart shows a command path and a
checksum feedback leg, so the link is bidirectional by design. The
`type` field leaves room to add uplink message types later without
breaking this contract.