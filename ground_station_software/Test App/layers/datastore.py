#bible - https://www.sqlitetutorial.net/
#jesus - https://docs.python.org/3/library/sqlite3.html

import sqlite3

from .serial_ingestion import Packet, FORMAT;
from dataclasses import asdict

#assumes parsed packet
def store_data(database: str, packet: Packet):

    connection = sqlite3.connect(database)

    connection.execute('''CREATE TABLE IF NOT EXISTS data
                    (packet_id, temp, lat, lon, alt, utc, vel)''')
    
    payload = asdict(packet)

    print(payload)

    packet_id = payload.get("packet_id")
    temp = payload.get("temp")
    lat = payload.get("latitude")
    lon = payload.get("longitude")
    alt = payload.get("altitude")
    utc = payload.get("utc_time")
    vel = payload.get("velocity")

    connection.execute(f'''INSERT INTO data VALUES('{packet_id}', '{temp}', 
                                                '{lat}', '{lon}', '{alt}',
                                                '{utc}', '{vel}')''')

    cursor = connection.cursor()

    for row in cursor.execute('SELECT * FROM data'):
        print(list(row))

    connection.commit()
    connection.close()


#query
