import sqlite3
import random
from datetime import datetime, timezone

DATABASE = 'databases.4-27-2026 database.db'

connection = sqlite3.connect(DATABASE)

dictionary = {"packet_id": None, "temp": None, "lat": None, "lon": None, "alt": None, "utc": None, "vel": None}

fields = list(dictionary.keys())
sql_command = f'CREATE TABLE IF NOT EXISTS data ({", ".join(fields)})'


connection.execute(sql_command)

count = 0
for flight in range(10):
    count += 1
    packet_id = count
    temp = random.uniform(-100, 100)
    lat = random.uniform(-90, 90)
    lon = random.uniform(-90, 90)
    alt = random.uniform(0, 30000)
    utc = datetime.now(timezone.utc).timestamp()
    vel = random.uniform(0, 500)
        
    connection.execute(f'''INSERT INTO data VALUES('{packet_id}', '{temp}', 
                                                   '{lat}', '{lon}', '{alt}',
                                                   '{utc}', '{vel}')''')

cursor = connection.cursor()


for row in cursor.execute('SELECT * FROM data'):
    print(list(row))

connection.commit()
connection.close()