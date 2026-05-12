import struct
import serial
from dataclasses import dataclass

#unique identifier for OUR telemetry packets
#can be changed later
HEADER = 0x4321

#2 + 34 + 2
PACKET_LENGTH = 38

#big endian packet format
#SHOULD STAY CONSISTENT, DO NOT WANT TO BE USING DIFFERENT FORMATS
FORMAT = ">H f d d f f f"
      
#packet dataclass -  34 bytes
@dataclass
class Packet:
    packet_id: int     #2 byte unsigned integer
    temp:      float   #4 byte float
    latitude:  float   #8 byte float
    longitude: float   #8 byte float
    altitude:  float   #4 byte float
    utc_time:  float   #4 byte float
    velocity:  float   #4 byte float

#constructs a checksum based on the bytes received
def chksum(packet: bytes) -> int:

    #if packet is odd, add an empty bit to make it even (parity)
    #this means we LOST some data somewhere
    if len(packet) % 2 != 0:
        packet += b'\x00'
    
    res = 0
    
    for i in range(0, len(packet), 2):
        word = (packet[i] << 8) | packet[i+1]
        res += word

    res = (res & 0xFFFF) + (res >> 16)

    #two's complement (-res == ~res + 1)
    return (-res + 1) & 0xFFFF;       

#checks all packets coming in for the right length, header and checksums
def validate_packet(raw_packet: bytes):

    #check if raw packet is of expected length
    if len(raw_packet) != PACKET_LENGTH:
        raise Exception(f"Raw packet received: {len(raw_packet)} bytes. Expected {PACKET_LENGTH}")    
    
    #check if raw packet header is of expected header
    header = struct.unpack_from(">H", raw_packet, 0)[0]
    if header != HEADER:
        raise Exception(f"Header received: {header}. Expected {HEADER}")
    
    #checksum
    expected_checksum = chksum(raw_packet[:36]) #stored in bytes 36 + 37 (int)

    #>H = big endian, not sure if blackpill is little or big
    received_checksum = struct.unpack_from(">H", raw_packet, 36)[0]
    if expected_checksum != received_checksum:
        raise Exception(f"Checksum received: {received_checksum}. Expected {expected_checksum}")

#reads packets through serial and returns validated packets
def read_packet(ser) -> bytes:
    raw_packet = ser.read(PACKET_LENGTH)
    #valid = validate_packet(raw_packet)
    return raw_packet