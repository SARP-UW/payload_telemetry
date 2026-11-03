from dataclasses import dataclass

@dataclass
class DeployablePacket:
    """
    Custom payload packet structure defined on both ground station and onboard systems

    This packet contains data related to the deployable system.
    The implementation of this packet is the responsibility of the deployable system to fill out.

    Please specify the fields and the lengths in byte for each field. Python
    and C data types are not the same and require further specification.

    A general implementation of this packet is provided below.
    """
    packet_id: int     #2 byte unsigned integer
    temp:      float   #4 byte float
    latitude:  float   #8 byte float
    longitude: float   #8 byte float
    altitude:  float   #4 byte float
    utc_time:  float   #4 byte float
    velocity:  float   #4 byte float