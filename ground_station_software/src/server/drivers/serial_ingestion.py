import struct
import numpy as np
from ground_station_software.src.constants import HEADER, PACKET_LENGTH, PAYLOAD_END, LengthException, HeaderException, ChecksumException
from ground_station_software.src.server.drivers.bytestream import RealSerial, FakeSerial

def checksum(packet: bytes) -> int:
    """Constructs a checksum based on the data received

    Args:
        packet (bytes): Specified packet payload in raw bytes

    Returns:
        int: Returns the checksum as an integer value
    """

    #* if packet is odd, add an empty bit to make it even (parity)
    #* this means we LOST some data somewhere
    if len(packet) % 2 != 0:
        packet += b'\x00'
    
    res = 0

    # ! currently a literal sum of data
    # ! consider implementing the widely used CRC 16 algorithm instead
    
    for i in range(0, len(packet), 2):
        word = (packet[i] << 8) | packet[i+1]
        res += word

    res = (res & 0xFFFF) + (res >> 16)

    #* two's complement (-res == ~res + 1)
    #* keep this, good application of cse 351
    return (-res + 1) & 0xFFFF;

def crc16(packet: bytes) -> int:
    """Working implementation of a CRC 16 algorithm

    Args:
        packet (bytes): _description_

    Returns:
        int: _description_
    """

def validate_packet(raw_packet: bytes):
    """Checks all packets coming in for the right length, header and checksum

    Args:
        raw_packet (bytes): Specified packet in raw bytes

    Raises:
        LengthException: Throws an exception if the packet received is not of the expected length
        HeaderException: Throws an exception if the packet received is not the right header
        ChecksumException: Throws an exception if the packet received does not have the expected checksum value
    """
    
    print('entered validation')

    #* check if raw packet is of expected length
    if len(raw_packet) != PACKET_LENGTH:
        raise LengthException(f"Raw packet received: {len(raw_packet)} bytes. Expected {PACKET_LENGTH}")    
    
    print('passed length check')

    #* check if raw packet header is of expected header
    header = struct.unpack_from(">H", raw_packet, 0)[0]
    if header != HEADER:
        raise HeaderException(f"Header received: {header}. Expected {HEADER}")
    
    print('passed header check')

    #* checksum
    expected_checksum = checksum(raw_packet[:PAYLOAD_END]) #stored in bytes 36 + 37 (int)

    #* >H = big endian, not sure if blackpill is little or big
    received_checksum = struct.unpack_from(">H", raw_packet, PAYLOAD_END)[0]
    if expected_checksum != received_checksum:
        raise ChecksumException(f"Checksum received: {received_checksum}. Expected {expected_checksum}")
    
    print('passed checksum')

#reads packets through serial and returns validated packets
def read_packet(ser: RealSerial | FakeSerial) -> bytes:
    """Reads packets over the serial port

    Args:
        ser (RealSerial, FakeSerial): Any serial port object

    Returns:
        bytes: Returns not yet packed validated packet for parsing
    """
    
    #* used to make use of dynamic typing, now forcing to use bytestream api
    #* could have crashed if fed an undefined type
    raw_packet = ser.read(PACKET_LENGTH)

    try:
        validate_packet(raw_packet)
    except LengthException as e:
        print(f"Inconsistent length of packet: {e}")
    except HeaderException as e:
        print(f"Inconsistent header of packet: {e}")
    except ChecksumException as e:
        print(f"Inconsistent checksum of packet: {e}")
    else:
        print('packet validated successfully')

    #! be careful that invalid packets are still being returned
    #? what to do when bad packet? not really sure rn 

    return raw_packet