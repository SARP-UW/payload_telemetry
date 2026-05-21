from dataclasses import dataclass

#unique identifier for OUR telemetry packets
#can be changed later
HEADER = 0x1234

#2 + 34 + 2
PACKET_LENGTH = 38

#big endian packet format
#SHOULD STAY CONSISTENT, DO NOT WANT TO BE USING DIFFERENT FORMATS
FORMAT = ">H f d d f f f"
      
#packet dataclass -  34 bytes
@dataclass
class Packet:
    packet_id: int     #2 byte unsigned integer
    temp:      float   #4 byte float
    latitude:  float   #8 byte float
    longitude: float   #8 byte float
    altitude:  float   #4 byte float
    utc_time:  float   #4 byte float
    velocity:  float   #4 byte float

