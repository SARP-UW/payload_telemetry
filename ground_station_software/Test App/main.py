import struct
import random

from layers import serial_ingestion
from layers import packet_parser
from layers import bytestream
from layers import datastore

from datetime import datetime, timezone

HEADER = 0x4321
FORMAT = ">H f d d f f f"

count = 0
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
    checksum = serial_ingestion.chksum(raw[:36])
    return raw + struct.pack(">H", checksum)

def test_fake_stream():
    packets = b"".join(build_test_packet() for _ in range(10))
    fake = bytestream.FakeSerial(packets)

    curr_time = "databases/" + str(datetime.now(timezone.utc).timestamp()) + ".db"

    for _ in range(10):
        raw = serial_ingestion.read_packet(fake)
        pkt = packet_parser.parse_packet(raw)

        datastore.store_data(curr_time, pkt)

        print(pkt)

def real_stream():
    real = bytestream.RealSerial('COM9')

    curr_time = "databases/" + str(datetime.now(timezone.utc).timestamp()) + ".db"

    while True:
        raw = serial_ingestion.read_packet(real)
        pkt = packet_parser.parse_packet(raw)

        datastore.store_data(curr_time, pkt)

        print(pkt)

if __name__ == "__main__":
    test_fake_stream()
    #real_stream()