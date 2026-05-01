import struct
from .serial_ingestion import Packet, FORMAT;

def parse_packet(raw_packet: bytes) -> Packet:

    body = raw_packet[2:36]
    values = struct.unpack(FORMAT, body)

    return Packet(*values)