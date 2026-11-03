import sqlite3
from dataclasses import asdict
from ground_station_software.src.constants import Packet

#assumes parsed packet
def store_data(database: str, packet: Packet):
    """
    Stores packets in local database given path and packet

    Args:
        database (str): Specified database path to save to
        packet (Packet): Specified packet to save
    """

    connection = sqlite3.connect(database)

    payload = asdict(packet)

    fields = list(payload.keys())
    connection.execute(f'CREATE TABLE IF NOT EXISTS data ({", ".join(fields)})')

    values = [str(payload.get(field)) for field in fields]
    connection.execute(f'''INSERT INTO data VALUES({", ".join(values)})''')

    connection.commit()
    connection.close()

def query(database: str):
    """
    Queries database for packet information

    Args:
        database (str): Specified database to query from
    """

    connection = sqlite3.connect(database)
    cursor = connection.cursor()

    for row in cursor.execute('SELECT * FROM data'):
        print(list(row))

    connection.close()


#search commands to find a value in a field
def search(database:str, field: str, value: str):
    """
    Searches database for a specific value in a given field

    Args:
        database (str): Specified database to search in
        field (str): Field name to search in
        value (str): Value to search for
    """
    connection = sqlite3.connect(database)
    cursor = connection.cursor()

    for row in cursor.execute(f'SELECT * FROM data WHERE {field} = "{value}"'):
        print(list(row))

    connection.close()
