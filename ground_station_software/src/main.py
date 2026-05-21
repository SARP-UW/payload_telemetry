from datetime import datetime, timezone

from ground_station_software.src.drivers import bytestream, datastore, serial_ingestion
from ground_station_software.src.parsers import packet_parser
from ground_station_software.src.testing import fakestream
from ground_station_software.src.constants import DATABASE

def real_stream(port: str):
    real = bytestream.RealSerial(port)

    curr_time = "databases/" + str(datetime.now(timezone.utc).timestamp()) + ".db"

    while True:
        # if serial has some tata
        raw = serial_ingestion.read_packet(real)
        pkt = packet_parser.parse_packet(raw)

        if (pkt != None):
            datastore.store_data(DATABASE, pkt)

        if (raw != None):
            print(raw)
        
        if (pkt != None):
            print(pkt)

if __name__ == "__main__":
    
    fakestream.test_fake_stream()
    #real_stream('COM6')