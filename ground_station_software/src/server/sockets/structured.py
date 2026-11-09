"""Interface between the Packet Parser and the WebSocket server ("Structured Data")."""

from dataclasses import dataclass


# PROVISIONAL: pending interface agreement with Thomas
@dataclass(frozen=True)
class StructuredPacket:
    """One parsed packet handed to the WebSocket server.

    Args:
        peripheral_id: source peripheral from the packet header
            (firmware: 0 = GPS, 1 = USART1, 2 = USART2)
        fields: parsed field values by name
        src_seq: per-source sequence number (packet_id on real hardware), if any
    """

    peripheral_id: int
    fields: dict[str, float | int]
    src_seq: int | None = None
