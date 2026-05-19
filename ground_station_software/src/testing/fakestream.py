import random
import struct

from datetime import datetime, timezone
from src.constants import FORMAT, HEADER

import src.drivers.serial_ingestion as srl
import src.drivers.bytestream as bytestream
import src.drivers.datastore as datastore
import src.parsers.packet_parser as packet_parser

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
    checksum = srl.chksum(raw[:36])
    return raw + struct.pack(">H", checksum)

def test_fake_stream():
    packets = b"".join(build_test_packet() for _ in range(10))
    fake = bytestream.FakeSerial(packets)

    curr_time = "databases/" + str(datetime.now(timezone.utc).timestamp()) + ".db"

    for _ in range(10):
        raw = srl.read_packet(fake)
        pkt = packet_parser.parse_packet(raw)

        datastore.store_data(curr_time, pkt)

        print(pkt)
