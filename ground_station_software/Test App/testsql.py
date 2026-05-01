#bible - https://www.sqlitetutorial.net/
#jesus - https://docs.python.org/3/library/sqlite3.html

import sqlite3
import random
from datetime import datetime, timezone

DATABASE = 'databases/4-27-2026 database.db'

connection = sqlite3.connect(DATABASE)

connection.execute('''CREATE TABLE IF NOT EXISTS data
                (packet_id, temp, lat, lon, alt, utc, vel)''')

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