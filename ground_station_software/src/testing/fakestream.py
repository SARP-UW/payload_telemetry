import random
import struct
from datetime import datetime, timezone

from ground_station_software.src.constants import FORMAT, HEADER, PAYLOAD_START, PAYLOAD_END
from ground_station_software.src.drivers import bytestream, datastore, serial_ingestion
from ground_station_software.src.parsers import packet_parser

count = 0

def build_test_packet() -> bytes:
    """Creates a fake packet for testing purposes

    Returns:
        bytes: Returns a validated packet with randomly generated payload
    """
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
    checksum = serial_ingestion.checksum(raw[PAYLOAD_START:PAYLOAD_START])
    return raw + struct.pack(">H", checksum)

def test_fake_stream(times: int, database: str):
    """Creates and initializes a fake bytestream to emulate a COM port using the FakeSerial API
    """

    packets = b"".join(build_test_packet() for _ in range(times))
    fake = bytestream.FakeSerial(packets)

    for _ in range(times):
        raw = serial_ingestion.read_packet(fake)
        pkt = packet_parser.parse_packet(raw)

        datastore.store_data(database, pkt)

        print(raw)
        print(pkt)