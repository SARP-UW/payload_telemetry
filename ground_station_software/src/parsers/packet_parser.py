import struct
from CONSTANTS import FORMAT, Packet

def parse_packet(raw_packet: bytes) -> Packet:

    #w/ Chksum is 2:36
    if (len(raw_packet) == 34):
        body = raw_packet
        values = struct.unpack(FORMAT, body)

        return Packet(*values)
