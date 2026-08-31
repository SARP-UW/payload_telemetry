"""JSON message contract for the telemetry WebSocket.

Defines the three message types sent to browser clients and builds them
from the Packet dataclass, so packet changes propagate without frontend
edits.
"""

import time
from dataclasses import fields, asdict

from ground_station_software.src.constants import Packet

#* bump when the message shape changes in a way clients must handle
SCHEMA_VERSION = 1

#* per-field display metadata, keyed by Packet field name
#! units are unconfirmed, see open question 5 in README.md
FIELD_META = {
    "packet_id": {"label": "Packet ID",  "unit": None,        "plot": False},
    "temp":      {"label": "Temperature","unit": "[confirm]", "plot": True},
    "latitude":  {"label": "Latitude",   "unit": "deg",       "plot": False},
    "longitude": {"label": "Longitude",  "unit": "deg",       "plot": False},
    "altitude":  {"label": "Altitude",   "unit": "[confirm]", "plot": True},
    "utc_time":  {"label": "UTC Time",   "unit": "[confirm]", "plot": False},
    "velocity":  {"label": "Velocity",   "unit": "[confirm]", "plot": True},
}


def build_schema_message() -> dict:
    """Builds the schema message sent once when a client connects.

    Returns:
        dict: Message describing every field the client can expect
    """

    descriptors = []

    for field in fields(Packet):
        meta = FIELD_META.get(field.name, {})

        descriptors.append({
            "name":  field.name,
            "type":  field.type.__name__ if hasattr(field.type, "__name__")
                     else str(field.type),
            "label": meta.get("label", field.name),
            "unit":  meta.get("unit"),
            "plot":  meta.get("plot", False),
        })

    return {
        "type":    "schema",
        "version": SCHEMA_VERSION,
        "fields":  descriptors,
    }


def build_data_message(packet: Packet) -> dict:
    """Builds a data message from one validated packet.

    Args:
        packet (Packet): Parsed packet from the packet parser

    Returns:
        dict: Message carrying field values and a receive timestamp
    """

    #! received_at is ground arrival time, not vehicle time.
    #! Airtime plus buffering makes it unsuitable for anything
    #! time-sensitive. Use the onboard timestamp field for that.
    return {
        "type":        "data",
        "received_at": time.time(),
        "values":      asdict(packet),
    }


def build_status_message(
    connected: bool,
    packets_ok: int,
    packets_bad: int,
    port: str | None = None,
) -> dict:
    """Builds a status message describing ground station health.

    Args:
        connected (bool): Whether the serial port is currently open
        packets_ok (int): Count of packets that passed validation
        packets_bad (int): Count of packets that failed validation
        port (str, optional): Serial port name. Defaults to None.

    Returns:
        dict: Message describing current link and counter state
    """

    return {
        "type":        "status",
        "connected":   connected,
        "port":        port,
        "packets_ok":  packets_ok,
        "packets_bad": packets_bad,
    }