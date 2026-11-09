"""Request Handler: validates commands sent from the browser.

Commands will go laptop -> board over the USB CDC ACM link.
The serial write path doesn't exist yet, so valid commands are acknowledged as
"not_sent". Command names and arguments are unknown until defined. [TBD with Christian]
"""

import json

TARGETS = ("reserved", "user1", "user2")


def _ack(cmd_seq: int | None, status: str, reason: str) -> dict:
    return {
        "type": "command_ack",  # PROVISIONAL
        "cmd_seq": cmd_seq,
        "status": status,
        "reason": reason,
    }


def handle_request(raw: str | bytes | None) -> dict:
    """Return the reply for one incoming frame. Never raises."""
    try:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        msg = json.loads(raw) if raw is not None else None
    except (UnicodeDecodeError, ValueError, TypeError):
        return _ack(None, "rejected", "message is not valid JSON")

    if not isinstance(msg, dict):
        return _ack(None, "rejected", "message must be a JSON object")
    if msg.get("type") != "command":
        return _ack(None, "rejected", "unknown message type")

    cmd_seq = msg.get("cmd_seq")
    if not isinstance(cmd_seq, int) or isinstance(cmd_seq, bool) or cmd_seq < 0:
        return _ack(None, "rejected", "cmd_seq must be a non-negative integer")
    if msg.get("target") not in TARGETS:
        return _ack(cmd_seq, "rejected", f"target must be one of {', '.join(TARGETS)}")
    command = msg.get("command")
    if not isinstance(command, str) or not command:
        return _ack(cmd_seq, "rejected", "command must be a non-empty string")
    if not isinstance(msg.get("args", {}), dict):
        return _ack(cmd_seq, "rejected", "args must be an object")

    return _ack(cmd_seq, "not_sent", "uplink not implemented")
