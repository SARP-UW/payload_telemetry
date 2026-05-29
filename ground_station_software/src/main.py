from ground_station_software.src.server.drivers import datastore, serial_ingestion, bytestream
from ground_station_software.src.server.parsers import packet_parser
from ground_station_software.src.testing import fakestream
from ground_station_software.src.constants import DATABASE

def real_stream(port: str, database: str):
    real = bytestream.RealSerial(port)

    while True:
        # if serial has some tata
        raw = serial_ingestion.read_packet(real)
        pkt = packet_parser.parse_packet(raw)

        if (pkt != None):
            datastore.store_data(database, pkt)

        if (raw != None):
            print(raw)
        
        if (pkt != None):
            print(pkt)

if __name__ == "__main__":
    
    #fakestream.test_fake_stream(10, DATABASE)
    real_stream('COM6', DATABASE)