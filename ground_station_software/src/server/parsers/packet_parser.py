import struct
import json
from dataclasses import dataclass
from ground_station_software.src.constants import FORMAT, PACKET_LENGTH, PAYLOAD_START, PAYLOAD_END, Packet

@dataclass 
class UserPacket:
    field1: str
    field2: str
    field3: str
    field4: str 

def parse_packet(raw_packet: bytes) -> Packet:
    """
    Packs validated raw bytes into uniform packets utilizing define packet structure

    Args:
        raw_packet (bytes): Validated packet in raw bytes

    Returns:
        Packet: Uniform packet
    """
    
    #full packet is 38 bytes, check if that is the case    
    if (len(raw_packet) == PACKET_LENGTH):

        #extract payload
        body = raw_packet[0:PAYLOAD_END]
        values = struct.unpack(FORMAT, body)

        return Packet(*values)

def parse_user_packet(raw_packet: bytes) -> UserPacket:
    """
    Packs validated raw bytes into uniform packets utilizing define packet structure

    Args:
        raw_packet (bytes): Validated packet in raw bytes

    Returns:
        UserPacket: Uniform packet
    """

    with open('ground_station_software/src/server/userconfigs/examplepacket.json', 'r') as f:
        user_packet_data = json.load(f)

    user_instance = UserPacket(**user_packet_data)
    
    #full packet is 38 bytes, check if that is the case    
    if (len(raw_packet) == PACKET_LENGTH):

        #extract payload
        body = raw_packet[0:PAYLOAD_END]
        values = struct.unpack(FORMAT, body)

        return UserPacket(*values)