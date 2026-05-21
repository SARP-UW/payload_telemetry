import struct
from ground_station_software.src.constants import HEADER, PACKET_LENGTH

def checksum(packet: bytes) -> int:
    """Constructs a checksum based on the data received

    Args:
        packet (bytes): Specified packet payload in raw bytes

    Returns:
        int: Returns the checksum as an integer value
    """

    #if packet is odd, add an empty bit to make it even (parity)
    #this means we LOST some data somewhere
    if len(packet) % 2 != 0:
        packet += b'\x00'
    
    res = 0

    # ! currently a literal sum of data
    # ! consider implementing the widely used CRC 16 algorithm instead
    
    for i in range(0, len(packet), 2):
        word = (packet[i] << 8) | packet[i+1]
        res += word

    res = (res & 0xFFFF) + (res >> 16)

    #two's complement (-res == ~res + 1)
    # ! keep this, good application of cse 351
    return (-res + 1) & 0xFFFF;       

def validate_packet(raw_packet: bytes):
    """Checks all packets coming in for the right length, header and checksum

    Args:
        raw_packet (bytes): Specified packet in raw bytes

    Raises:
        Exception: Throws an exception if the packet received is not of the expected length
        Exception: Throws an exception if the packet received is not the right header
        Exception: Throws an exception if the packet received does not have the expected checksum value
    """
    
    # TODO ALL EXCEPTIONS CURRENTLY CRASH THE PROGRAM IF SOMETHING IS WRONG, PLEASE FIX DURING WORK SESH

    print('entered validation')

    #check if raw packet is of expected length
    if len(raw_packet) != PACKET_LENGTH:
        raise Exception(f"Raw packet received: {len(raw_packet)} bytes. Expected {PACKET_LENGTH}")    
    
    print('passed length check')

    #check if raw packet header is of expected header
    header = struct.unpack_from(">H", raw_packet, 0)[0]
    if header != HEADER:
        raise Exception(f"Header received: {header}. Expected {HEADER}")
    
    print('passed header check')

    #checksum
    expected_checksum = checksum(raw_packet[:36]) #stored in bytes 36 + 37 (int)

    print(f'expected checksum: {expected_checksum}')

    #>H = big endian, not sure if blackpill is little or big
    received_checksum = struct.unpack_from(">H", raw_packet, 36)[0]
    if expected_checksum != received_checksum:
        raise Exception(f"Checksum received: {received_checksum}. Expected {expected_checksum}")
    
    print('passed checksum')

#reads packets through serial and returns validated packets
def read_packet(ser) -> bytes:
    """Reads packets over the serial port

    Args:
        ser (any): _description_

    Returns:
        bytes: Returns not yet packed validated packet for parsing
    """
    raw_packet = ser.read(PACKET_LENGTH)

    # ! THIS LINE CRASHES PROGRAM... 
    # TODO FIX VALIDATION ALGORITHM
    # valid = validate_packet(raw_packet)
    # print('packet validated successfully')

    return raw_packet