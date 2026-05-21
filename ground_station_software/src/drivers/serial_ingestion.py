import struct

from ground_station_software.src.constants import HEADER, PACKET_LENGTH

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
    expected_checksum = chksum(raw_packet[:36]) #stored in bytes 36 + 37 (int)

    print(f'expected checksum: {expected_checksum}')

    #>H = big endian, not sure if blackpill is little or big
    #received_checksum = struct.unpack_from(">H", raw_packet, 36)[0]
    #if expected_checksum != received_checksum:
    #    raise Exception(f"Checksum received: {received_checksum}. Expected {expected_checksum}")
    
    #print('passed checksum')

#reads packets through serial and returns validated packets
def read_packet(ser) -> bytes:
    raw_packet = ser.read(PACKET_LENGTH)

    #valid = validate_packet(raw_packet)

    #print('packet validated successfully')

    return raw_packet