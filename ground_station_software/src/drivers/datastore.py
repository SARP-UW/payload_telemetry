#bible - https://www.sqlitetutorial.net/
#jesus - https://docs.python.org/3/library/sqlite3.html

import sqlite3
from dataclasses import asdict
from ground_station_software.src.constants import Packet

def table_string(packet: Packet) -> str:

    payload = asdict(packet)

    string = ''

    for field in payload:
        value = str(payload.get(field))
        string += value

    return string

def insertion_string(packet: Packet) -> str:
    return ''

#assumes parsed packet
def store_data(database: str, packet: Packet):
    """Stores packets in local database given path and packet

    Args:
        database (str): Specified database path to save to
        packet (Packet): Specified packet to save
    """

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
        print('entered into database:')
        print(list(row))

    connection.commit()
    connection.close()

def query(database: str):
    """Queries database for packet information

    Args:
        database (str): Specified database to query from
    """


    #search commands to find a value in a field
