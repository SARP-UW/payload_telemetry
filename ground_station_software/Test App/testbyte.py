import struct
import random

import readbyte

from datetime import datetime, timezone

HEADER = 0x4321
FORMAT = ">H f d d f f f"

count = 0;


def build_test_packet():
    global count
    count += 1

    packet_id = count
    temp = random.uniform(-100, 100)
    lat = random.uniform(-90, 90)
    lon = random.uniform(-90, 90)
    alt = random.uniform(0, 30000)
    utc = datetime.now(timezone.utc).timestamp()
    vel = random.uniform(0, 500)

    body = struct.pack(FORMAT, packet_id, temp, lat, lon, alt, utc, vel)
    header = struct.pack(">H", HEADER)

    raw = header + body
    checksum = readbyte.chksum(raw[:36])
    return raw + struct.pack(">H", checksum)

def test_fake_stream():
    packets = b"".join(build_test_packet() for _ in range(10))
    fake = readbyte.FakeSerial(packets)

    for _ in range(10):
        raw = readbyte.read_packet(fake)
        pkt = readbyte.parse_packet(raw)
        print(pkt)

if __name__ == "__main__":
    test_fake_stream()