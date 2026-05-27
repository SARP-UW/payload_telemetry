from datetime import datetime, timezone

from ground_station_software.src.drivers import bytestream, datastore, serial_ingestion
from ground_station_software.src.parsers import packet_parser
from ground_station_software.src.testing import fakestream
from ground_station_software.src.constants import DATABASE

def real_stream(port: str, database: str):
    real = bytestream.RealSerial(port)

    while True:
        # if serial has some tata
        raw = serial_ingestion.read_packet(real)
        pkt = packet_parser.parse_packet(raw)

        print(pkt)

        if (pkt != None):
            datastore.store_data(database, pkt)

        if (raw != None):
            print(raw)
        
        if (pkt != None):
            print(pkt)

if __name__ == "__main__":
    
    fakestream.test_fake_stream(10, DATABASE)
    #real_stream('COM6', database)