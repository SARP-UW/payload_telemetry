import serial
import time
import struct
import array
from dataclasses import dataclass

#unique identifier for OUR telemetry packets
#can be changed later
HEADER = 0x4321

#2 + 34 + 2
PACKET_LENGTH = 38

#big endian packet format
FORMAT = ">H f d d f f f"

ser = serial.Serial('COM3', 9600, timeout=1)
time.sleep(2)

def read_packet(ser):
    while True:
        byte = ser.read(1)
        if not byte:
            continue
        #check for first byte of the header
        if byte == b'\x43':
            second = ser.read(1)

            #check for second byte of the header
            if second == b'\x21':
                rest = ser.read(PACKET_LENGTH - 2)
                return byte + second + rest

#two's complement checksum
def chksum(packet: bytes) -> int:

    #if packet is odd, add an empty bit to make it even (parity)
    #this means we LOST some data somewhere
    if len(packet) % 2 != 0:
        packet += b'\x00'
    
    #array of unsigned shorts (2 bytes each)
    #byte string is therefore made of 16-bit ints
    arr = array.array("H", packet)
    arr.byteswap()
    res = sum(arr)

    #two's complement (-res == ~res + 1)
    return (-res + 1) & 0xFFFF;       

#packet dataclass - body is 34 bytes
@dataclass
class Packet:
    packet_id: int     #2 byte unsigned integer
    temp:      float   #4 byte float
    latitude:  float   #8 byte float
    longitude: float   #8 byte float
    altitude:  float   #4 byte float
    utc_time:  float   #4 byte float
    velocity:  float   #4 byte float

#checks all packets coming in for the right length, header and checksums
def validate_packet(raw_packet: bytes):

    #check if raw packet is of expected length
    if len(raw_packet) != PACKET_LENGTH:
        raise Exception("Raw packet: " + len(raw_packet) + " bytes. Expected " + PACKET_LENGTH + " bytes.")
    
    #check if raw packet header is of expected header
    header = struct.unpack_from(">H", raw_packet, 0)[0]
    if header != HEADER:
        raise Exception("Header received: " + header + ". Expected " + HEADER)
    
    #checksum
    expected_checksum = chksum(raw_packet[:36]) #stored in bytes 37 + 38 (int)
    received_checksum = struct.unpack_from("<H", raw_packet, 36)[0]
    if expected_checksum != received_checksum:
        raise Exception("Checksum received: " + received_checksum + ". Expected " + expected_checksum)

#runs our validation checks, then constructs our validated packet
def parse_packet(raw_packet: bytes) -> Packet:
    validate_packet(raw_packet)

    body = raw_packet[2:36]
    values = struct.unpack(FORMAT, body)

    return Packet(*values)
    
    


    
