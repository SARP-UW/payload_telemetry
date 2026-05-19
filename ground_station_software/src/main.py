import drivers.serial_ingestion as serial_ingestion
import parsers.packet_parser as packet_parser
import drivers.bytestream as bytestream
import drivers.datastore as datastore
import testing.fakestream as fakestream

from datetime import datetime, timezone

def real_stream(port: str):
    real = bytestream.RealSerial(port)

    curr_time = "databases/" + str(datetime.now(timezone.utc).timestamp()) + ".db"

    while True:
        # if serial has some tata
        raw = serial_ingestion.read_packet(real)
        pkt = packet_parser.parse_packet(raw)

        if (pkt != None):
            datastore.store_data("5-7-2026 database.db", pkt)

        if (raw != None):
            print(raw)
        #print(bin(raw))
        
        if (pkt != None):
            print(pkt)

if __name__ == "__main__":
    fakestream.test_fake_stream()
    #real_stream('COM6')