import struct
from ground_station_software.src.constants import FORMAT, PACKET_LENGTH, PAYLOAD_START, PAYLOAD_END, Packet

def parse_packet(raw_packet: bytes) -> Packet:
    """Packs validated raw bytes into uniform packets utilizing define packet structure

    Args:
        raw_packet (bytes): Validated packet in raw bytes

    Returns:
        Packet: Uniform packet
    """
    
    #full packet is 38 bytes, check if that is the case    
    if (len(raw_packet) == PACKET_LENGTH):

        #extract payload
        body = raw_packet[PAYLOAD_START:PAYLOAD_END]
        values = struct.unpack(FORMAT, body)

        return Packet(*values)