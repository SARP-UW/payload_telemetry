from dataclasses import dataclass

#unique identifier for OUR telemetry packets
#can be changed later
HEADER = 0x1234

#2 + 34 + 2
PACKET_LENGTH = 38

#big endian packet format
#SHOULD STAY CONSISTENT, DO NOT WANT TO BE USING DIFFERENT FORMATS
FORMAT = ">H f d d f f f"

PAYLOAD_START = 2
PAYLOAD_END = 36
      
DATABASE = 'ground_station_software\databases\TelemetryDatabase.db'
DATABASE2 = r'ground_station_software\databases\friday 5-22 testing database.db'

#packet dataclass -  34 bytes
@dataclass
class Packet:
    """Custom payload packet structure defined on both ground station and onboard systems
    """
    packet_id: int     #2 byte unsigned integer
    temp:      float   #4 byte float
    latitude:  float   #8 byte float
    longitude: float   #8 byte float
    altitude:  float   #4 byte float
    utc_time:  float   #4 byte float
    velocity:  float   #4 byte float

class LengthException(Exception):
    """Exception raised in validation for inconsistent lengths

    Args:
        Exception: Python built-in Exception class
        message: explanation of the error
    """

    def __init__(self, message: str):
        super().__init__(message)

class HeaderException(Exception):
    """Exception raised in validation for inconsistent headers

    Args:
        Exception: Python built-in Exception class
        message: explanation of the error
    """

    def __init__(self, message: str):
        super().__init__(message)

class ChecksumException(Exception):
    """Exception raised in validation for inconsistent checksums

    Args:
        Exception: Python built-in Exception class
        message: explanation of the error
    """

    def __init__(self, message: str):
        super().__init__(message)